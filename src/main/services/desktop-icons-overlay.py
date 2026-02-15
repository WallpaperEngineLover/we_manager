#!/usr/bin/env python3
"""
Desktop icons overlay for we_manager.

Renders desktop icons on a transparent layer-shell surface (LAYER_BOTTOM)
so they appear on top of the linux-wallpaperengine wallpaper.

The overlay is purely visual — input passes through via empty wl_region
to plasmashell's Folder View underneath, which handles clicks normally.

Launch with: LD_PRELOAD=/usr/lib64/libgtk4-layer-shell.so python3 this.py [MONITOR]
"""

import sys
import os
import json
import subprocess
import configparser

import cairo as _cairo  # pycairo — needed for empty input region

import gi
gi.require_version('Gtk4LayerShell', '1.0')
gi.require_version('Gtk', '4.0')
from gi.repository import Gtk4LayerShell, Gtk, Gdk, Gio, GLib


# --- KDE desktop config parsing ---

def get_desktop_dir():
    try:
        result = subprocess.run(
            ['xdg-user-dir', 'DESKTOP'], capture_output=True, text=True, timeout=3
        )
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip()
    except Exception:
        pass
    return os.path.expanduser('~/Desktop')


def get_panel_offset():
    """Detect KDE panel position and size to offset the icon grid."""
    try:
        output = subprocess.run(
            ['qdbus', 'org.kde.plasmashell', '/PlasmaShell',
             'org.kde.PlasmaShell.evaluateScript',
             '''var p = panels();
             for (var i = 0; i < p.length; i++)
                 print(p[i].location + "," + p[i].height);'''],
            capture_output=True, text=True, timeout=3
        )
        if output.returncode == 0:
            for line in output.stdout.strip().split('\n'):
                parts = line.strip().split(',')
                if len(parts) == 2:
                    loc, size = parts[0], int(parts[1])
                    # location: 3=left, 4=right, 5=top, 6=bottom
                    if loc == 'left':
                        return size, 0, 0, 0  # left, right, top, bottom
                    elif loc == 'right':
                        return 0, size, 0, 0
                    elif loc == 'top':
                        return 0, 0, size, 0
                    elif loc == 'bottom':
                        return 0, 0, 0, size
    except Exception:
        pass
    return 0, 0, 0, 0


def parse_kde_positions(screen_key='2560x1440'):
    """Parse icon positions from KDE's plasma desktop config."""
    config_path = os.path.expanduser(
        '~/.config/plasma-org.kde.plasma.desktop-appletsrc'
    )
    if not os.path.exists(config_path):
        return {}, 1, 1

    try:
        cp = configparser.ConfigParser(strict=False)
        cp.read(config_path)

        for section in cp.sections():
            if not section.endswith('][General]'):
                continue
            if not cp.has_option(section, 'positions'):
                continue

            positions_raw = cp.get(section, 'positions')
            try:
                positions_data = json.loads(positions_raw)
            except json.JSONDecodeError:
                continue

            if screen_key not in positions_data:
                for key in positions_data:
                    screen_key = key
                    break
                else:
                    continue

            arr = positions_data[screen_key]
            if len(arr) < 2:
                continue

            cols = int(arr[0])
            rows = int(arr[1])
            icons = {}

            i = 2
            while i + 2 < len(arr):
                name = arr[i]
                col = int(arr[i + 1])
                row = int(arr[i + 2])
                if name.startswith('desktop:/'):
                    name = name[len('desktop:/'):]
                icons[name] = (col, row)
                i += 3

            return icons, cols, rows

    except Exception as e:
        print(f'Error parsing KDE positions: {e}', file=sys.stderr)

    return {}, 1, 1


def get_desktop_entries(desktop_dir):
    entries = []
    if not os.path.isdir(desktop_dir):
        return entries

    for name in sorted(os.listdir(desktop_dir)):
        if name.startswith('.'):
            continue
        full_path = os.path.join(desktop_dir, name)

        if name.endswith('.desktop'):
            entry = parse_desktop_file(full_path)
            if entry:
                entry['filename'] = name
                entries.append(entry)
        else:
            entries.append({
                'filename': name,
                'name': name,
                'icon_name': get_mime_icon(full_path),
                'path': full_path,
            })

    return entries


def parse_desktop_file(path):
    try:
        real_path = os.path.realpath(path)
        kf = GLib.KeyFile()
        kf.load_from_file(real_path, GLib.KeyFileFlags.NONE)

        name = kf.get_locale_string('Desktop Entry', 'Name', None)
        icon = kf.get_string('Desktop Entry', 'Icon')

        return {
            'name': name or os.path.basename(path),
            'icon_name': icon or 'application-x-executable',
            'path': path,
        }
    except Exception:
        return None


def get_mime_icon(path):
    try:
        f = Gio.File.new_for_path(path)
        info = f.query_info('standard::icon', Gio.FileQueryInfoFlags.NONE, None)
        icon = info.get_icon()
        if isinstance(icon, Gio.ThemedIcon):
            names = icon.get_names()
            if names:
                return names[0]
    except Exception:
        pass
    return 'folder' if os.path.isdir(path) else 'text-x-generic'


# --- KDE settings auto-detection ---

# Kirigami icon size table (index → pixels), matching FolderTools.js
_ICON_SIZE_TABLE = [22, 32, 48, 64, 96, 128, 256]

# CSS font-weight mapping from KDE weight values (Qt::Weight)
_KDE_WEIGHT_MAP = {
    25: 200,   # Light
    50: 400,   # Normal
    57: 500,   # Medium
    63: 600,   # DemiBold
    75: 700,   # Bold
    81: 800,   # ExtraBold
    87: 900,   # Black
}


def detect_kde_settings():
    """Auto-detect icon size, font, and label styling from KDE config.

    Returns a dict with keys:
        icon_size (int), font_family (str), font_size_pt (int),
        font_weight (int CSS weight), font_italic (bool)
    """
    settings = {
        'icon_size': 64,
        'font_family': 'Noto Sans',
        'font_size_pt': 11,
        'font_weight': 400,
        'font_italic': False,
    }

    # --- Icon size from Folder View config ---
    try:
        config_path = os.path.expanduser(
            '~/.config/plasma-org.kde.plasma.desktop-appletsrc'
        )
        if os.path.exists(config_path):
            cp = configparser.ConfigParser(strict=False)
            cp.read(config_path)
            # Find the desktop containment's General section
            for section in cp.sections():
                if 'General' not in section:
                    continue
                if cp.has_option(section, 'iconSize'):
                    idx = int(cp.get(section, 'iconSize'))
                    if 0 <= idx < len(_ICON_SIZE_TABLE):
                        settings['icon_size'] = _ICON_SIZE_TABLE[idx]
                    break
    except Exception:
        pass

    # --- System font from kreadconfig6 ---
    try:
        result = subprocess.run(
            ['kreadconfig6', '--file', 'kdeglobals',
             '--group', 'General', '--key', 'font'],
            capture_output=True, text=True, timeout=3
        )
        if result.returncode == 0 and result.stdout.strip():
            # Format: family,pointSize,pixelSize,styleHint,weight,italic,...
            parts = result.stdout.strip().split(',')
            if len(parts) >= 6:
                settings['font_family'] = parts[0]
                try:
                    settings['font_size_pt'] = int(parts[1])
                except ValueError:
                    pass
                try:
                    kde_weight = int(parts[4])
                    # Find closest CSS weight
                    closest = min(_KDE_WEIGHT_MAP.keys(),
                                  key=lambda k: abs(k - kde_weight))
                    settings['font_weight'] = _KDE_WEIGHT_MAP[closest]
                except (ValueError, IndexError):
                    pass
                try:
                    settings['font_italic'] = parts[5] == '1'
                except IndexError:
                    pass
    except FileNotFoundError:
        pass
    except Exception:
        pass

    # KDE Folder View always renders desktop icon labels in italic
    settings['font_italic'] = True

    return settings


# --- Layout ---

_kde = detect_kde_settings()
ICON_SIZE = _kde['icon_size']
CELL_WIDTH = 120
CELL_HEIGHT = 96
# KDE Folder View internal padding (approx)
GRID_MARGIN = 8


def build_icon_widget(entry, icon_theme):
    box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=2)
    box.set_halign(Gtk.Align.CENTER)
    box.set_size_request(CELL_WIDTH, CELL_HEIGHT)

    icon_name = entry.get('icon_name', 'application-x-executable')
    image = Gtk.Image()
    image.set_pixel_size(ICON_SIZE)

    paintable = icon_theme.lookup_icon(
        icon_name, None, ICON_SIZE, 1,
        Gtk.TextDirection.NONE, Gtk.IconLookupFlags(0)
    )
    if paintable:
        image.set_from_paintable(paintable)
    else:
        fallback = icon_theme.lookup_icon(
            'application-x-executable', None, ICON_SIZE, 1,
            Gtk.TextDirection.NONE, Gtk.IconLookupFlags(0)
        )
        if fallback:
            image.set_from_paintable(fallback)

    image.set_halign(Gtk.Align.CENTER)
    box.append(image)

    label = Gtk.Label(label=entry.get('name', ''))
    label.set_max_width_chars(12)
    label.set_ellipsize(3)  # PANGO_ELLIPSIZE_END
    label.set_halign(Gtk.Align.CENTER)
    label.set_justify(Gtk.Justification.CENTER)
    label.set_wrap(True)
    label.set_wrap_mode(2)  # PANGO_WRAP_WORD_CHAR
    label.set_lines(2)
    label.add_css_class('icon-label')
    box.append(label)

    return box


def main():
    monitor_name = sys.argv[1] if len(sys.argv) > 1 else None
    desktop_dir = get_desktop_dir()
    window = None
    file_monitor = None
    empty_region = _cairo.Region()

    def apply_empty_input_region(widget, frame_clock):
        """Tick callback: reapply empty input region every frame."""
        surface = window.get_surface()
        if surface:
            surface.set_input_region(empty_region)
        return True  # Keep the callback active

    def on_activate(app):
        nonlocal window, file_monitor

        if window:
            return

        window = Gtk.Window()
        window.set_application(app)

        # Layer shell init BEFORE present
        Gtk4LayerShell.init_for_window(window)
        Gtk4LayerShell.set_layer(window, Gtk4LayerShell.Layer.BOTTOM)
        Gtk4LayerShell.set_namespace(window, 'desktop')

        # Target monitor
        if monitor_name:
            display = Gdk.Display.get_default()
            monitors = display.get_monitors()
            for i in range(monitors.get_n_items()):
                mon = monitors.get_item(i)
                if mon.get_connector() == monitor_name:
                    Gtk4LayerShell.set_monitor(window, mon)
                    break

        # Fullscreen
        for edge in (Gtk4LayerShell.Edge.TOP, Gtk4LayerShell.Edge.BOTTOM,
                     Gtk4LayerShell.Edge.LEFT, Gtk4LayerShell.Edge.RIGHT):
            Gtk4LayerShell.set_anchor(window, edge, True)

        Gtk4LayerShell.set_exclusive_zone(window, -1)
        Gtk4LayerShell.set_keyboard_mode(window, Gtk4LayerShell.KeyboardMode.NONE)

        # CSS — use auto-detected font settings
        font_style = 'italic' if _kde['font_italic'] else 'normal'
        font_weight = _kde['font_weight']
        css = Gtk.CssProvider()
        css.load_from_string(f"""
            window {{ background: transparent; }}
            .icon-label {{
                color: white;
                font-family: "{_kde['font_family']}";
                font-size: {_kde['font_size_pt']}pt;
                font-weight: {font_weight};
                font-style: {font_style};
            }}
        """)
        Gtk.StyleContext.add_provider_for_display(
            Gdk.Display.get_default(), css,
            Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
        )

        build_icons()

        # Watch ~/Desktop for changes
        desktop_file = Gio.File.new_for_path(desktop_dir)
        file_monitor = desktop_file.monitor_directory(
            Gio.FileMonitorFlags.NONE, None
        )
        file_monitor.connect('changed', on_desktop_changed)

        window.present()

        # Reapply empty input region every frame so GTK4 can't override it
        window.add_tick_callback(apply_empty_input_region)

    def build_icons():
        if not window:
            return

        # Get monitor resolution
        display = Gdk.Display.get_default()
        monitors = display.get_monitors()
        screen_w, screen_h = 2560, 1440
        for i in range(monitors.get_n_items()):
            mon = monitors.get_item(i)
            if monitor_name and mon.get_connector() != monitor_name:
                continue
            geo = mon.get_geometry()
            screen_w = geo.width
            screen_h = geo.height
            break

        # Get panel offset
        panel_left, panel_right, panel_top, panel_bottom = get_panel_offset()

        # Parse KDE positions
        screen_key = f'{screen_w}x{screen_h}'
        kde_positions, grid_cols, grid_rows = parse_kde_positions(screen_key)

        # KDE Folder View uses a fixed cell size based on icon size (not screen/grid ratio).
        # The grid_rows value tells us how many cells fit vertically.
        # cell_h = available_height / grid_rows (typically ~62px for 48px icons)
        avail_h = screen_h - panel_top - panel_bottom
        cell_h = avail_h / max(grid_rows, 1)
        # Cell width is the same fixed size regardless of column count
        cell_w = CELL_WIDTH

        entries = get_desktop_entries(desktop_dir)
        if not entries:
            window.set_child(Gtk.Box())
            return

        fixed = Gtk.Fixed()
        icon_theme = Gtk.IconTheme.get_for_display(Gdk.Display.get_default())

        for entry in entries:
            filename = entry['filename']

            if filename in kde_positions:
                col, row = kde_positions[filename]
            else:
                col, row = 0, len(kde_positions)
                kde_positions[filename] = (col, row)

            # Top-left alignment within grid cell (matches KDE Folder View)
            x = panel_left + GRID_MARGIN + col * cell_w
            y = panel_top + GRID_MARGIN + row * cell_h

            widget = build_icon_widget(entry, icon_theme)
            fixed.put(widget, max(0, x), max(0, y))

        window.set_child(fixed)

    def on_desktop_changed(monitor, file, other_file, event_type):
        if event_type in (
            Gio.FileMonitorEvent.CREATED,
            Gio.FileMonitorEvent.DELETED,
            Gio.FileMonitorEvent.MOVED_IN,
            Gio.FileMonitorEvent.MOVED_OUT,
        ):
            GLib.timeout_add(500, build_icons)

    app = Gtk.Application(application_id='com.wemanager.desktop-icons-overlay')
    app.connect('activate', on_activate)
    app.run(None)


if __name__ == '__main__':
    main()
