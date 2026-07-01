/**
 * 公共脱敏工具
 */
export function maskImei(imei: string): string {
  if (imei.length < 8) return imei;
  return imei.slice(0, 6) + '****' + imei.slice(-4);
}

export function maskPhone(phone: string): string {
  if (phone.length < 7) return phone;
  return phone.slice(0, 3) + '****' + phone.slice(-4);
}
