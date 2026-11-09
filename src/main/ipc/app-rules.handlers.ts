import { ipcMain } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import type { AppRule } from '@shared/types'
import { deleteAppRule, getActiveRuleIds, getAppRules, saveAppRule } from '../services/app-rules.service'
import { captureProfile, deleteProfile, getProfiles } from '../services/profile.service'
import { isAudioDetectionAvailable } from '../utils/audio-activity'
import { applyProfile } from '../services/rule-actions.service'
import { getScheduleRules, saveScheduleRule } from '../services/schedule.service'

export function registerAppRuleHandlers(): void {
  ipcMain.handle(IpcChannels.APP_RULES_GET_ALL, () => getAppRules())

  ipcMain.handle(IpcChannels.APP_RULES_SAVE, (_e, rule: Omit<AppRule, 'id'> & { id?: string }) => saveAppRule(rule))

  ipcMain.handle(IpcChannels.APP_RULES_DELETE, (_e, id: string) => {
    deleteAppRule(id)
    return { ok: true }
  })

  ipcMain.handle(IpcChannels.APP_RULES_ACTIVE, () => getActiveRuleIds())

  ipcMain.handle(IpcChannels.APP_RULES_AUDIO_AVAILABLE, () => isAudioDetectionAvailable())

  ipcMain.handle(IpcChannels.PROFILES_GET_ALL, () => getProfiles())

  ipcMain.handle(IpcChannels.PROFILES_CAPTURE, (_e, name: string) => captureProfile(name))

  ipcMain.handle(IpcChannels.PROFILES_DELETE, (_e, id: string) => {
    // rules that load the profile would only fail from now on
    let disabled = 0
    for (const rule of getAppRules()) {
      if (!rule.enabled || rule.action.type !== 'profile' || rule.action.profileId !== id) continue
      saveAppRule({ ...rule, enabled: false })
      disabled++
    }
    for (const rule of getScheduleRules()) {
      if (!rule.enabled || rule.action.type !== 'profile' || rule.action.profileId !== id) continue
      saveScheduleRule({ ...rule, enabled: false })
      disabled++
    }
    deleteProfile(id)
    return { ok: true, disabled }
  })

  ipcMain.handle(IpcChannels.PROFILES_APPLY, async (_e, id: string) => {
    await applyProfile(id)
    return { ok: true }
  })
}
