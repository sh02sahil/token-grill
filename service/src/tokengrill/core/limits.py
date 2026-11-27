"""Bounds on what a service response or another tool's file may put into a reading.

Those are lower-trust inputs. Each list, count, date and window length is cut
to what a reading can show, so that one account cannot make the readings, the
D-Bus messages or the popup unusable for all accounts.
"""

# Windows of one list, or reset credits, kept in one reading. The popup has room for no more.
MAX_LISTED = 20
# All windows of one reading: the canonical ones plus up to MAX_LISTED from each list a service sends.
MAX_WINDOWS = 2 * MAX_LISTED
MAX_RESET_CREDITS = 10_000
# The last millisecond of the year 9999: Python datetime, GLib.DateTime and JS Date all hold it.
MAX_EPOCH_MS = 253_402_300_799_999
MAX_WINDOW_SECONDS = 366 * 86400
# More than any real token count, and still exact as a JS number.
MAX_TOKENS = 2**53 - 1
# One stored reading; all of them together must stay below the 4 MiB read limit of the state files.
MAX_READING_BYTES = 64 * 1024
