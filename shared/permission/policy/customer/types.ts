export type CustomerPermissions = {
  create: boolean
  read: boolean
  update: boolean
  delete: boolean
}

export type CustomerPlanFeatures = {
  exportCsv: boolean
  exportCsvLimit: number
}
