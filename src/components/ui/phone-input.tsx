import { getCountries, getCountryCallingCode } from "libphonenumber-js";
import { useId } from "react";

import { useField } from "@/components/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { phoneDigits, type PhoneNumber } from "@/lib/phone";

const names = new Intl.DisplayNames(["en"], { type: "region" });
const countries = getCountries()
  .map((code) => ({ code, name: names.of(code) ?? code, callingCode: getCountryCallingCode(code) }))
  .sort((a, b) => a.name.localeCompare(b.name, "en"));

export function PhoneInput({
  value,
  onChange,
  disabled,
  id,
}: {
  value: PhoneNumber;
  onChange: (value: PhoneNumber) => void;
  disabled?: boolean;
  id?: string;
}) {
  const field = useField();
  const generatedId = useId();
  const inputId = id ?? field?.id ?? generatedId;

  return <div className="flex min-w-0">
    <Select value={value.country} disabled={disabled} onValueChange={(code) => {
      const country = countries.find((item) => item.code === code);
      if (country) onChange({ ...value, country: country.code });
    }}>
      <SelectTrigger id={`${inputId}-country`} aria-label="Country calling code"
        className="h-auto w-28 shrink-0 rounded-r-none border-r-0">
        <SelectValue>{value.country} +{getCountryCallingCode(value.country)}</SelectValue>
      </SelectTrigger>
      <SelectContent className="w-64 max-w-[calc(100vw-2rem)]">
        {countries.map((country) => <SelectItem key={country.code} value={country.code}
          textValue={`${country.name} +${country.callingCode}`}>
          {country.name} (+{country.callingCode})
        </SelectItem>)}
      </SelectContent>
    </Select>
    <Input id={inputId} type="tel" inputMode="numeric" autoComplete="tel-national"
      placeholder="10-digit number" className="rounded-l-none"
      value={value.number} disabled={disabled} maxLength={10} pattern="[0-9]{10}"
      onChange={(event) => onChange({ ...value, number: phoneDigits(event.target.value) })}
      onPaste={(event) => {
        event.preventDefault();
        const input = event.currentTarget;
        const pasted = event.clipboardData.getData("text").replace(/\D/g, "");
        const start = input.selectionStart ?? value.number.length;
        const end = input.selectionEnd ?? start;
        onChange({ ...value, number: phoneDigits(value.number.slice(0, start) + pasted + value.number.slice(end)) });
      }}
    />
  </div>;
}
