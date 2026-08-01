export const WE_APP_ID = 431960

export const DEFAULT_LWE_REPO = 'https://github.com/Almamu/linux-wallpaperengine.git'

// CEF's own windowless_frame_rate is set to max(60, maximumFPS) regardless of --fps (see
// CWeb.cpp), so it's already trying to paint at least this fast internally - a lower --fps just
// throttles how often the engine's outer render loop actually picks up and displays a frame.
export const RECOMMENDED_WEB_FPS = 60
