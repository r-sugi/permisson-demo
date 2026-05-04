import { PolicyBase } from '../base'
import type { SettingsPermissions, SettingsPlanFeatures } from './types'

export abstract class SettingsPolicyBase extends PolicyBase {
  abstract listPermissions(): SettingsPermissions & SettingsPlanFeatures
}
