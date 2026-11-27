"""Kiro usage limits from the kiro-cli sign-in."""

import hashlib
from dataclasses import dataclass

from tokengrill.core.errors import ServiceError
from tokengrill.core.paths import provider_paths
from tokengrill.core.types import ProviderInstance, ProviderSnapshot, empty_snapshot
from tokengrill.providers.base import CollectorContext, LimitsUpdate, collect_limits
from tokengrill.providers.kiro.auth import (
    KiroAuth,
    is_kiro_token_fresh,
    kiro_database_stamp,
    read_kiro_auth,
)
from tokengrill.providers.kiro.endpoints import kiro_usage_request_body, kiro_usage_url
from tokengrill.providers.kiro.normalize import KiroUsage, normalize_kiro_usage
from tokengrill.providers.kiro.usage_policy import KiroRejectedTokens, kiro_usage_error


def _auth_expired() -> ServiceError:
    return ServiceError("auth-expired", "kiro.auth-expired")


def _stored_fingerprint(path: str, auth: KiroAuth) -> str:
    """Identifies the credentials kiro-cli currently stores. Other tools may rewrite them at any time, so
    every cache is tied to this value."""
    material = "\n".join([path, auth.access_token, auth.refresh_token or "", auth.profile_arn or ""])
    return hashlib.sha256(material.encode()).hexdigest()


@dataclass(frozen=True)
class _Stored:
    stamp: str
    auth: KiroAuth
    fingerprint: str


class KiroCollector:
    def __init__(self) -> None:
        # Stored sign-ins, re-read only when the database changes on disk. A failed read is not cached.
        self._stored: dict[str, _Stored] = {}
        self._rejected = KiroRejectedTokens()

    async def collect(
        self, instance: ProviderInstance, snapshot: ProviderSnapshot, ctx: CollectorContext
    ) -> ProviderSnapshot:
        if not instance["liveUsageEnabled"]:
            return snapshot
        try:
            update = await self._limits(instance, ctx)
        except ServiceError as error:
            # An account without Kiro usage says nothing about the previous account, so its numbers are
            # cleared instead of being shown as stale data.
            base = empty_snapshot(instance["id"]) if error.code == "unsupported-account" else snapshot
            failure = error

            async def rejected() -> LimitsUpdate:
                raise failure

            return await collect_limits(ctx, base, rejected)

        async def ready() -> LimitsUpdate:
            return {"plan": update.plan, "account": update.account, "windows": update.windows}

        return await collect_limits(ctx, snapshot, ready)

    async def _limits(self, instance: ProviderInstance, ctx: CollectorContext) -> KiroUsage:
        stored = await self._stored_auth(instance)
        known = None if ctx.manual else self._rejected.get(instance["id"], stored.fingerprint)
        if known is not None:
            raise known
        self._rejected.forget(instance["id"])
        try:
            return await self._fetch_limits(ctx, stored.auth)
        except ServiceError as error:
            self._rejected.remember(instance["id"], stored.fingerprint, error)
            raise

    async def _stored_auth(self, instance: ProviderInstance) -> _Stored:
        path = provider_paths(instance)["authFile"]
        stamp = await kiro_database_stamp(path)
        cached = self._stored.get(path)
        if cached is not None and cached.stamp == stamp:
            return cached
        auth = await read_kiro_auth(path)
        entry = _Stored(stamp, auth, _stored_fingerprint(path, auth))
        self._stored[path] = entry
        return entry

    async def _fetch_limits(self, ctx: CollectorContext, stored: KiroAuth) -> KiroUsage:
        # Token Grill never refreshes a kiro-cli sign-in. AWS SSO-OIDC replaces the refresh token on each
        # refresh and rejects the old one, and kiro-cli deletes its sign-in when its own refresh is then
        # rejected, so a refresh here would sign kiro-cli out. Only kiro-cli renews its sign-in.
        if not is_kiro_token_fresh(stored.expires_at):
            raise _auth_expired()
        auth = stored
        try:
            payload = await ctx.http.request_json(
                "POST",
                kiro_usage_url(auth.service_region),
                {
                    "Accept": "application/json",
                    "Authorization": f"Bearer {auth.access_token}",
                    "Content-Type": "application/x-amz-json-1.0",
                    "X-Amz-Target": "AmazonCodeWhispererService.GetUsageLimits",
                },
                kiro_usage_request_body(auth.profile_arn),
            )
        except ServiceError as error:
            raise kiro_usage_error(error) from None
        usage = normalize_kiro_usage(payload)
        if not usage.windows:
            raise ServiceError("response-shape", "net.no-usage")
        return usage
