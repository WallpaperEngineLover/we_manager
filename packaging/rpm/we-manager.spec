%global debug_package %{nil}
%global __strip /bin/true
%global __brp_mangle_shebangs %{nil}
%global upstream_version 0.9.8
%global appdir %{_libdir}/%{name}
%global __provides_exclude_from ^%{appdir}/.*$
%global __requires_exclude ^(lib(ffmpeg|vk_swiftshader|vulkan|EGL|GLESv2|steam_api)\\.so.*)$

Name:           we-manager
Version:        0.9.8
Release:        1%{?dist}
Summary:        Wallpaper Engine workshop manager
License:        MIT AND BSD-3-Clause AND Apache-2.0 AND MPL-2.0 AND LGPL-2.1-or-later
URL:            https://github.com/WallpaperEngineLover/we_manager
Source0:        %{url}/releases/download/v%{upstream_version}/%{name}_%{upstream_version}_amd64.deb

ExclusiveArch:  x86_64
BuildRequires:  binutils
BuildRequires:  tar
BuildRequires:  xz
BuildRequires:  desktop-file-utils

Requires:       gtk3
Requires:       nss
Requires:       xdg-utils
Requires:       at-spi2-core
Requires:       python3
Recommends:     libappindicator-gtk3
Suggests:       linux-wallpaperengine-kde

%description
Browse, organize and apply Wallpaper Engine workshop wallpapers on Linux with
the engine from linux-wallpaperengine-kde. Handles playlists, per-wallpaper
settings, backups and engine updates.

The Electron and Chromium runtime is bundled in %{appdir}.

%prep
%setup -q -c -T
ar x %{SOURCE0}
tar -xf data.tar.*

%build

%install
install -d %{buildroot}%{_libdir}
mv "opt/WE Manager" %{buildroot}%{appdir}
cp -a usr %{buildroot}/
rm -f %{buildroot}%{_docdir}/%{name}/changelog.gz
install -d %{buildroot}%{_bindir}
ln -s ../%{_lib}/%{name}/we-manager %{buildroot}%{_bindir}/we-manager
sed -i 's|^Exec=.*|Exec=we-manager %U|' %{buildroot}%{_datadir}/applications/we-manager.desktop
sed -i '1s|^#!/usr/bin/env python3|#!/usr/bin/python3|' %{buildroot}%{appdir}/resources/desktop-icons-overlay.py

(
    cd %{buildroot}
    find .%{appdir} -mindepth 0 -type d | sed 's|^\.|%%dir |'
    find .%{appdir} ! -type d | sed 's|^\.||' \
        | sed -e 's|^\(%{appdir}/LICENSE.electron.txt\)$|%%license \1|' \
              -e 's|^\(%{appdir}/LICENSES.chromium.html\)$|%%license \1|' \
              -e 's|^\(%{appdir}/chrome-sandbox\)$|%%verify(not mode) \1|'
) > %{_builddir}/app-files.list

%check
desktop-file-validate %{buildroot}%{_datadir}/applications/we-manager.desktop

%post
# the .deb's postinst: the setuid sandbox helper only where the kernel has no user namespaces
if ! { [ -L /proc/self/ns/user ] && unshare --user true; } 2>/dev/null; then
    chmod 4755 %{appdir}/chrome-sandbox || :
fi

%files -f %{_builddir}/app-files.list
%license %{_docdir}/%{name}/copyright
%{_bindir}/we-manager
%{_datadir}/applications/we-manager.desktop
%{_datadir}/icons/hicolor/*/apps/we-manager.png

%changelog
* Thu Oct 29 2026 WallpaperEngineLover <260361707+WallpaperEngineLover@users.noreply.github.com> - 0.9.8-1
- Repackage the 0.9.8 release as an rpm
