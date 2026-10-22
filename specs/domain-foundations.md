# Domain Foundations

Last updated: fix/ruxt-core-refactor@95cd2e5 | 2026-10-22

## Scope

This spec covers reusable primitives under:

- `core/domain/value-object.ts`;
- `core/domain/datetime/`;
- canonical email under `core/domain/email/` and password primitives under `core/domain/iam/`;
- `core/domain/phone/`;
- `core/domain/payment/`;
- barrel exports in `core/domain/index.ts` and subsystem `index.ts` files.

Subscription/catalog and IAM policy behavior belong to their owning specs.

## Value Objects

`ValueObject<T>` shallow-freezes the props object and implements equality by requiring the same concrete constructor and equal `JSON.stringify(props)`. Domain classes expose typed factories, getters, and serialization as needed and generally return new instances for operations.

The freeze is shallow: nested objects and arrays must be frozen or treated immutably by each owning value object. JSON-string equality is property-order-sensitive and relies on serializable props.

## Date And Time

`Instant` stores integer epoch milliseconds. `fromISO()` requires an explicit `Z` or `±HH:MM` suffix to reject timezone-ambiguous datetimes. Arithmetic uses elapsed milliseconds, and JSON is UTC ISO-8601.

`Duration` is a numeric millisecond quantity with unit constructors, conversions, and arithmetic. Its factories currently accept any numeric value without finite/integer/non-negative validation.

`SocialDate` is a calendar-only year/month/day type with strict `YYYY-MM-DD` parsing, leap-year/day validation, UTC-based day arithmetic, month-end clamping, and ISO serialization.

## Email And Password

The canonical `Email` is `core/domain/email/email.ts`, exported by its subsystem barrel: it trims, lowercases, requires a nonempty basic `local@domain.tld` shape, and exposes canonical `value`. There is no second IAM Email implementation in the inspected checkout.

Password types distinguish plaintext from persistent hashes and redact string/JSON conversion. `PasswordValidator` composes rules and reports all failures; available rules cover minimum length, uppercase, digit, special character, and exact-match common-password sets. Hashing is an injected `PasswordHasher` interface implemented in infrastructure.

`core/domain/email/email-validator.ts` is a tracked empty artifact without a validator implementation or observed call site; its disposition is recorded in [TODO.md](TODO.md). This does not imply that the active Email lacks tests.

## Phone Numbers

`CountryCode` is a typed tuple joining an ISO alpha-2 code to the repository's numeric calling-code table. `PhoneNumber.create()` validates required input, allowed characters, 4–15 normalized digits, and the matching country/calling-code pair. Detailed local formats currently exist only for US, VN, JP, FR, DE, and ES.

Stored `PhoneNumber.value` is digits-only. `internationalValue` and `toString()` prefix the configured calling code; `toJSON()` returns local digits plus country tuple.

## Payment And Billing

`CardNumber` removes spaces/hyphens, requires 12–19 digits and a valid Luhn checksum, and derives Visa, Mastercard, American Express, Discover, or other. String and JSON display only brand/last four, but the normalized complete number remains available through `.value` for in-process consumers.

`BillingAddress` trims and requires line 1, city, and postal code while retaining an ISO country code and optional line 2/state. `Billing` requires a trimmed full name and combines address with optional email/phone. Billing deliberately excludes card data.

Payment and phone types are exported from `core/domain/index.ts` but currently have no handler, API route, repository, schema, or frontend call site.

## Current Gaps

- The empty email-validator artifact has no defined behavior contract.
- Core `tests/domain-foundations.test.ts` covers email validation/canonicalization, date arithmetic, money/cycle/subscription behavior, and card masking/Luhn rejection. This is not exhaustive coverage of equality, all country data or every validation boundary.
- `Duration` accepts `NaN`, infinities, fractions, and negative values, which can later create invalid date calculations.
- Card objects retain and expose complete primary account numbers in memory; no tokenization/provider boundary or PCI-oriented persistence rule exists because cards are not integrated yet.
- Most countries receive generic phone-length validation only, and normalization can duplicate a calling code if callers pass an already international number as the local value.
