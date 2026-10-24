#!/usr/bin/env python3
"""
Desktop icons overlay for we_manager.

Draws the icons of KDE's Folder View on a transparent layer-shell surface (LAYER_BOTTOM) above the
linux-wallpaperengine wallpaper, which would otherwise cover them. The surface takes no input (empty
wl_region), clicks go to the desktop underneath.

Launch with: LD_PRELOAD=<libgtk4-layer-shell.so.0> GDK_BACKEND=wayland python3 this.py [CONNECTOR]
Exit codes: 2 a Python module or typelib is missing, 3 no layer-shell, 4 no monitor
"""

import configparser
import json
import locale
import os
import shutil
import subprocess
import sys
import urllib.parse

try:
    import cairo
    import gi
    gi.require_version('Gtk4LayerShell', '1.0')
    gi.require_version('Gtk', '4.0')
    gi.require_version('Pango', '1.0')
    from gi.repository import Gtk4LayerShell, Gtk, Gdk, Gio, GLib, Pango
except (ImportError, ValueError) as e:
    print(f'missing: {e}', file=sys.stderr)
    sys.exit(2)

APPLETSRC = os.path.expanduser('~/.config/plasma-org.kde.plasma.desktop-appletsrc')

ICON_SIZES = [22, 32, 48, 64, 96, 128, 256]
SMALL_SPACING = 4
SMALL_ICON = 16


def read_config(path):
    cp = configparser.RawConfigParser(strict=False, interpolation=None)
    cp.optionxform = str
    try:
        cp.read(path, encoding='utf-8')
    except (configparser.Error, OSError, UnicodeDecodeError):
        pass
    return cp


def kreadconfig(file, group, key):
    for tool in ('kreadconfig6', 'kreadconfig5'):
        exe = shutil.which(tool)
        if not exe:
            continue
        try:
            out = subprocess.run([exe, '--file', file, '--group', group, '--key', key],
                                 capture_output=True, text=True, timeout=3)
        except (OSError, subprocess.SubprocessError):
            continue
        if out.returncode == 0:
            return out.stdout.strip()
    return ''


def folder_view_containments(cp):
    found = []
    for section in cp.sections():
        parts = section.split('][')
        if len(parts) != 2 or parts[0] != 'Containments':
            continue
        if cp.get(section, 'plugin', fallback='') != 'org.kde.desktopcontainment':
            continue
        general = section + '][General'
        found.append({
            'screen': cp.getint(section, 'lastScreen', fallback=0),
            'general': dict(cp.items(general)) if cp.has_section(general) else {},
        })
    found.sort(key=lambda c: c['screen'])
    return found


def folder_view_for(cp, screen_index):
    found = folder_view_containments(cp)
    for c in found:
        if c['screen'] == screen_index:
            return c['general']
    return found[0]['general'] if found else {}


def desktop_dir(general):
    url = general.get('url', '')
    if url.startswith('file://'):
        return urllib.parse.unquote(url[len('file://'):])
    try:
        out = subprocess.run(['xdg-user-dir', 'DESKTOP'], capture_output=True, text=True, timeout=3)
        if out.returncode == 0 and out.stdout.strip():
            return out.stdout.strip()
    except (OSError, subprocess.SubprocessError):
        pass
    return os.path.expanduser('~/Desktop')


def saved_positions(general, width, height):
    """Folder View keeps one entry per resolution: [columns, rows, name, column, row, ...]"""
    raw = general.get('positions', '')
    if not raw:
        return {}
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    arr = data.get(f'{width}x{height}')
    if not isinstance(arr, list) or len(arr) < 2:
        return {}
    icons = {}
    for i in range(2, len(arr) - 2, 3):
        name = str(arr[i])
        if name.startswith('desktop:/'):
            name = urllib.parse.unquote(name[len('desktop:/'):])
        try:
            icons[name] = (int(arr[i + 1]), int(arr[i + 2]))
        except (TypeError, ValueError):
            continue
    return icons


def icon_for_path(path):
    names = []
    try:
        info = Gio.File.new_for_path(path).query_info('standard::icon,standard::content-type',
                                                       Gio.FileQueryInfoFlags.NONE, None)
        icon = info.get_icon()
        if isinstance(icon, Gio.ThemedIcon):
            names = [n for n in icon.get_names() if n != 'text-x-generic']
        generic = Gio.content_type_get_generic_icon_name(info.get_content_type())
        if generic:
            names.append(generic)
    except GLib.Error:
        pass
    names.append('folder' if os.path.isdir(path) else 'text-x-generic')
    return names


def desktop_entry(path):
    try:
        kf = GLib.KeyFile()
        kf.load_from_file(os.path.realpath(path), GLib.KeyFileFlags.NONE)
        return (kf.get_locale_string('Desktop Entry', 'Name', None),
                kf.get_string('Desktop Entry', 'Icon'))
    except GLib.Error:
        return None, None


def read_entries(directory, dirs_first, descending):
    entries = []
    try:
        names = os.listdir(directory)
    except OSError:
        return entries
    for name in names:
        if name.startswith('.'):
            continue
        path = os.path.join(directory, name)
        label, icon = (None, None)
        if name.endswith('.desktop'):
            label, icon = desktop_entry(path)
        entries.append({
            'file': name,
            'label': label or name,
            'icon': [icon] if icon else icon_for_path(path),
            'dir': os.path.isdir(path),
        })
    key = lambda e: locale.strxfrm(e['label'].casefold())
    entries.sort(key=key, reverse=descending)
    if dirs_first:
        entries.sort(key=lambda e: not e['dir'])
    return entries


class Metrics:
    """Cell size of Folder View's icon grid (FolderView.qml, gridView.cellWidth/cellHeight)"""

    def __init__(self, general, font_px, view_w, view_h):
        size_idx = int(general.get('iconSize', 3)) if str(general.get('iconSize', 3)).isdigit() else 3
        self.icon = ICON_SIZES[size_idx] if 0 <= size_idx < len(ICON_SIZES) else 64
        grid_unit = font_px
        label_width = int(general.get('labelWidth', 1)) if str(general.get('labelWidth', 1)).isdigit() else 1
        text_lines = int(general.get('textLines', 2)) if str(general.get('textLines', 2)).isdigit() else 2
        cell_w = max(self.icon + 2 * grid_unit + 2 * SMALL_SPACING, SMALL_ICON * (label_width * 2 + 4))
        cell_h = self.icon + grid_unit * text_lines + SMALL_SPACING * 3
        self.cell_w = cell_w + self._extra(cell_w, view_w)
        self.cell_h = cell_h + self._extra(cell_h, view_h)
        self.lines = text_lines

    @staticmethod
    def _extra(cell, container):
        count = container // cell if cell else 0
        if count <= 0:
            return 0
        return int(max(container - count * cell, 0) / count)


def place(entries, saved, general, m, view_w, view_h):
    """Cell (column, row) per entry: saved ones stay, the others take the free cells in flow order"""
    columns_first = general.get('arrangement', '0') == '1'
    right = general.get('alignment', '0') == '1'
    per_row = max(view_w // m.cell_w, 1)
    per_col = max(view_h // m.cell_h, 1)
    taken = set(saved.values())
    cells = {}
    cursor = 0

    def cell_at(n):
        if columns_first:
            return n // per_col, n % per_col
        return n % per_row, n // per_row

    for e in entries:
        if e['file'] in saved:
            cells[e['file']] = saved[e['file']]
            continue
        while cell_at(cursor) in taken:
            cursor += 1
        cells[e['file']] = cell_at(cursor)
        taken.add(cell_at(cursor))
    return cells, right, per_row


def main():
    connector = sys.argv[1] if len(sys.argv) > 1 else None
    display = Gdk.Display.get_default()
    if display is None or not Gtk4LayerShell.is_supported():
        print('no Wayland layer-shell', file=sys.stderr)
        sys.exit(3)

    locale.setlocale(locale.LC_ALL, '')

    theme = kreadconfig('kdeglobals', 'Icons', 'Theme')
    if theme:
        Gtk.Settings.get_for_display(display).set_property('gtk-icon-theme-name', theme)

    font_family, font_pt, font_weight, font_italic = 'Noto Sans', 10, 400, False
    font = kreadconfig('kdeglobals', 'General', 'font').split(',')
    if len(font) >= 6:
        font_family = font[0] or font_family
        try:
            font_pt = float(font[1])
            font_italic = font[5] == '1'
            weight = int(font[4])
            font_weight = weight * 8 if weight <= 100 else weight
        except ValueError:
            pass

    monitors = display.get_monitors()
    monitor, index = None, 0
    for i in range(monitors.get_n_items()):
        mon = monitors.get_item(i)
        if connector is None or mon.get_connector() == connector:
            monitor, index = mon, i
            break
    if monitor is None:
        print(f'no monitor {connector}', file=sys.stderr)
        sys.exit(4)

    state = {'window': None, 'layer': None, 'size': (0, 0), 'font_px': 20, 'rebuild': 0}
    empty = cairo.Region()

    def font_height_px():
        layout = Pango.Layout.new(window.get_pango_context())
        desc = Pango.FontDescription.new()
        desc.set_family(font_family)
        desc.set_size(int(font_pt * Pango.SCALE))
        layout.set_font_description(desc)
        metrics = layout.get_context().get_metrics(desc, None)
        return round((metrics.get_ascent() + metrics.get_descent()) / Pango.SCALE)

    def apply_input_region(*_):
        surface = window.get_surface()
        if surface:
            surface.set_input_region(empty)

    def relayout(width=None, height=None):
        layer = state['layer']
        if width is not None:
            state['size'] = (width, height)
        view_w, view_h = state['size']
        for child in list(state['children']):
            layer.remove(child)
        state['children'] = []
        if view_w <= 0 or view_h <= 0:
            return False

        general = folder_view_for(read_config(APPLETSRC), index)
        m = Metrics(general, state['font_px'], view_w, view_h)
        geo = monitor.get_geometry()
        saved = saved_positions(general, geo.width, geo.height)
        entries = read_entries(desktop_dir(general), general.get('sortDirsFirst', 'true') != 'false',
                               general.get('sortDesc', 'false') == 'true')
        cells, right, per_row = place(entries, saved, general, m, view_w, view_h)
        theme = Gtk.IconTheme.get_for_display(display)

        for e in entries:
            col, row = cells[e['file']]
            x = col * m.cell_w
            if right:
                x = view_w - (col + 1) * m.cell_w
            widget = icon_widget(e, m, theme)
            layer.put(widget, max(0, x), max(0, row * m.cell_h))
            state['children'].append(widget)
        return False

    def icon_widget(entry, m, theme):
        box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=SMALL_SPACING)
        box.set_size_request(m.cell_w, m.cell_h)
        box.set_halign(Gtk.Align.START)
        box.set_valign(Gtk.Align.START)
        box.set_margin_top(SMALL_SPACING * 2)

        image = Gtk.Image()
        image.set_pixel_size(m.icon)
        names = entry['icon']
        if os.path.isabs(names[0]):
            image.set_from_file(names[0])
        else:
            usable = [n for n in names if theme.has_icon(n)] or ['application-x-executable']
            paintable = theme.lookup_icon(usable[0], None, m.icon, 1, Gtk.TextDirection.NONE,
                                          Gtk.IconLookupFlags(0))
            if paintable:
                image.set_from_paintable(paintable)
        image.set_halign(Gtk.Align.CENTER)
        box.append(image)

        label = Gtk.Label(label=entry['label'])
        label.set_halign(Gtk.Align.CENTER)
        label.set_justify(Gtk.Justification.CENTER)
        label.set_wrap(True)
        label.set_wrap_mode(Pango.WrapMode.WORD_CHAR)
        label.set_ellipsize(Pango.EllipsizeMode.END)
        label.set_lines(m.lines)
        label.set_max_width_chars(-1)
        label.set_size_request(m.cell_w - 2 * SMALL_SPACING, -1)
        label.add_css_class('icon-label')
        box.append(label)
        return box

    def on_layout(surface, width, height):
        apply_input_region()
        if (width, height) != state['size']:
            GLib.idle_add(relayout, width, height)

    def schedule_rebuild(*_):
        if state['rebuild']:
            GLib.source_remove(state['rebuild'])

        def run():
            state['rebuild'] = 0
            relayout()
            return False

        state['rebuild'] = GLib.timeout_add(300, run)

    def on_activate(app):
        nonlocal window
        window = Gtk.Window(application=app)
        Gtk4LayerShell.init_for_window(window)
        Gtk4LayerShell.set_layer(window, Gtk4LayerShell.Layer.BOTTOM)
        Gtk4LayerShell.set_namespace(window, 'desktop')
        Gtk4LayerShell.set_monitor(window, monitor)
        for edge in (Gtk4LayerShell.Edge.TOP, Gtk4LayerShell.Edge.BOTTOM,
                     Gtk4LayerShell.Edge.LEFT, Gtk4LayerShell.Edge.RIGHT):
            Gtk4LayerShell.set_anchor(window, edge, True)
        Gtk4LayerShell.set_exclusive_zone(window, 0)
        Gtk4LayerShell.set_keyboard_mode(window, Gtk4LayerShell.KeyboardMode.NONE)

        state['font_px'] = font_height_px()
        css = Gtk.CssProvider()
        css.load_from_string(f"""
            window {{ background: transparent; }}
            .icon-label {{
                color: white;
                font-family: "{font_family}";
                font-size: {font_pt}pt;
                font-weight: {font_weight};
                font-style: {'italic' if font_italic else 'normal'};
                text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
            }}
        """)
        Gtk.StyleContext.add_provider_for_display(display, css, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION)

        state['children'] = []
        state['layer'] = Gtk.Fixed()
        window.set_child(state['layer'])

        window.connect('map', apply_input_region)
        window.present()
        tries = [0]

        def first_layout():
            tries[0] += 1
            width, height = window.get_width(), window.get_height()
            if width > 0 and height > 0 and state['size'] == (0, 0):
                relayout(width, height)
            return state['size'] == (0, 0) and tries[0] < 40

        GLib.timeout_add(250, first_layout)
        surface = window.get_surface()
        if surface:
            surface.connect('layout', on_layout)

        general = folder_view_for(read_config(APPLETSRC), index)
        watched = [Gio.File.new_for_path(desktop_dir(general)),
                   Gio.File.new_for_path(os.path.dirname(APPLETSRC))]
        state['monitors'] = []
        for f in watched:
            try:
                mon = f.monitor_directory(Gio.FileMonitorFlags.NONE, None)
            except GLib.Error:
                continue
            mon.connect('changed', schedule_rebuild)
            state['monitors'].append(mon)
        monitor.connect('notify::geometry', schedule_rebuild)

    window = None
    app = Gtk.Application(application_id=f'com.wemanager.desktop-icons-overlay.screen{index}')
    app.connect('activate', on_activate)
    app.run(None)


if __name__ == '__main__':
    main()
