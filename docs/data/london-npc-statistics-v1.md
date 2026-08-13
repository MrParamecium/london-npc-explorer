# London NPC Statistics V1

This release combines recent official margins with Census 2021 small-area
structure. The exact files, checksums, release dates, and geography code systems
are locked in `data/manifests/london-npc-statistics-v1.json`.

## Source policy

- Age and statistical sex use ONS mid-2024 single-year LSOA estimates, released
  in November 2025. Ages are filtered to 18 through 90 before aggregation.
- Ethnic group, economic activity, work pattern, occupation, commute, tenure,
  and qualification use Census 2021 LSOA tables published by the GLA Census
  Information Scheme from ONS base data under OGL v3.0.
- Household context uses ONS RM057 version 3. It counts people, not households,
  so a larger household contributes more resident observations than a one-person
  household. It is available at borough and London level only.
- Employee income uses residence-based ASHE 2025 provisional Table 8.7 annual
  gross pay. It applies only to employees. Suppressed, disclosive, unavailable,
  or CV-over-20-percent cells are never converted to zero.
- Neighbourhood context uses the corrected V2 English Indices of Deprivation 2025
  File 7 and its 2021 LSOA codes.

## Denominator and derivation rules

Each metric keeps its published denominator. Household tenure is a household
distribution, occupation and commute are worker distributions, and ASHE is an
employee distribution. These populations are not silently multiplied into
fictional cross-tables.

Census metrics are imported at LSOA and aggregated by their published borough
code to borough and Greater London. Current ward codes do not match the Census
ward vintage, so V1 intentionally imports no ward statistics. Runtime fallback
is therefore metric-specific: `LSOA -> borough -> London` where no compatible
ward row exists.

Ethnic group is sampled independently and has no outgoing dependency. It never
selects occupation, income, personality, name, values, speech, or appearance.

## Known limitations

RM057 publishes age in broad categories, so V1 uses its person-weighted adult
margin rather than claiming single-year household composition. Census 2021 is
the latest full small-area structure and is not relabelled as 2025 data. ASHE
contains employee pay, not self-employed income; a self-employed NPC therefore
has no statistically asserted income in this version.
