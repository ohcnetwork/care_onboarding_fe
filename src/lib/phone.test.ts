import assert from "node:assert/strict";
import test from "node:test";
import { phoneDigits, phoneToInternational, validPhone } from "./phone";

test("phone entry keeps only digits and limits the national number to ten", () => {
  assert.equal(phoneDigits("90abc 000-00000"), "9000000000");
  assert.equal(phoneDigits("123456789012"), "1234567890");
  assert.equal(phoneDigits("abc"), "");
});

test("phone validation requires exactly ten digits, excluding the country code", () => {
  for (const number of ["", "123456789", "12345678901", "12345abc90", "+919000000000"]) {
    assert.equal(validPhone({ country: "IN", number }), false);
    assert.throws(() => phoneToInternational({ country: "IN", number }), /exactly 10/);
  }
  assert.equal(validPhone({ country: "IN", number: "9000000000" }), true);
});

test("international payload uses the selected country calling code", () => {
  assert.equal(phoneToInternational({ country: "IN", number: "9000000000" }), "+919000000000");
  assert.equal(phoneToInternational({ country: "GB", number: "7700900123" }), "+447700900123");
  assert.equal(phoneToInternational({ country: "US", number: "2025550123" }), "+12025550123");
});
