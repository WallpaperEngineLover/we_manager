/**
 * The command line of a linux-wallpaperengine process: the program is the first word (a path, or the bare name), the
 * portable build's launcher script runs it as `<shell> <script>` and its binary is `.bin`. Anything else that merely
 * has the name somewhere in its arguments (an editor on the repo folder, git, make) is not an engine. Words are
 * separated by single spaces here, a program in a folder with spaces in its name is not matched.
 *
 * One pattern for pkill -f (POSIX ERE) and for RegExp, it only uses what both read the same way.
 */
export const LWE_PROCESS_PATTERN = '^((/[^ ]*/)?(ba|da)?sh )?(/[^ ]*/)?linux-wallpaperengine(\\.bin)?( |$)'

const LWE_PROCESS_REGEXP = new RegExp(LWE_PROCESS_PATTERN)

/** /proc/<pid>/cmdline (NUL separated) or `ps` output (space separated) */
export function isLweCommandLine(cmdline: string): boolean {
  return LWE_PROCESS_REGEXP.test(cmdline.replace(/\0+$/, '').replace(/\0/g, ' '))
}
