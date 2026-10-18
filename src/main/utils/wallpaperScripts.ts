import { pathToFileURL } from 'url'

export function fileUri(filePath: string): string {
  return pathToFileURL(filePath).href
}

function jsString(value: string): string {
  return JSON.stringify(value).replace(/[\u2028\u2029]/g, (c) => '\\u' + c.charCodeAt(0).toString(16))
}

export function plasmaWallpaperScript(imagePath: string): string {
  return `
    var allDesktops = desktops();
    for (var i = 0; i < allDesktops.length; i++) {
      var d = allDesktops[i];
      d.wallpaperPlugin = 'org.kde.image';
      d.currentConfigGroup = ['Wallpaper', 'org.kde.image', 'General'];
      d.writeConfig('Image', ${jsString(fileUri(imagePath))});
    }
  `
}

export function finderWallpaperArgs(imagePath: string): string[] {
  return [
    '-e',
    'on run argv',
    '-e',
    'tell application "Finder" to set desktop picture to POSIX file (item 1 of argv)',
    '-e',
    'end run',
    imagePath
  ]
}
