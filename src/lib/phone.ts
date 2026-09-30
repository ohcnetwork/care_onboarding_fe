import { getCountryCallingCode, type CountryCode } from "libphonenumber-js";

export type PhoneNumber = { country: CountryCode; number: string };

export function phoneDigits(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 10);
}

export function validPhone(phone: PhoneNumber): boolean {
  return /^\d{10}$/.test(phone.number);
}

export function phoneToInternational(phone: PhoneNumber): string {
  if (!validPhone(phone)) throw new Error("Enter exactly 10 digits for the phone number.");
  return `+${getCountryCallingCode(phone.country)}${phone.number}`;
}
