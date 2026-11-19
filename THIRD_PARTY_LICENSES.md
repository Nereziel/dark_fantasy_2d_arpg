# Third-party licenses / Licence externích součástí

This file records known third-party software and fonts currently loaded by Aether & Ruin. Their original licenses remain in force; the project's GPL-3.0-only license **does not relicense third-party works**.

Tento soubor eviduje známé externí knihovny a fonty, které Aether & Ruin načítá. Platí pro ně jejich původní licence; GPL-3.0-only **nemění licenci děl třetích stran**.

## Currently used / Aktuálně používané

| Component / Součást | Use / Použití | Original license / Původní licence | License and attribution / Licence a autorství |
| --- | --- | --- | --- |
| Tailwind CSS | Loaded at runtime from `https://cdn.tailwindcss.com` | MIT | [Tailwind Labs license](https://github.com/tailwindlabs/tailwindcss/blob/main/LICENSE) — Copyright © Tailwind Labs, Inc. |
| Cinzel | Loaded from Google Fonts | SIL Open Font License 1.1 | [Cinzel OFL](https://github.com/google/fonts/blob/main/ofl/cinzel/OFL.txt) — The Cinzel Project Authors |
| MedievalSharp | Loaded from Google Fonts | SIL Open Font License 1.1 | [MedievalSharp OFL](https://github.com/google/fonts/blob/main/ofl/medievalsharp/OFL.txt) — wmk69 |
| Inter | Loaded from Google Fonts | SIL Open Font License 1.1 | [Inter OFL](https://github.com/google/fonts/blob/main/ofl/inter/OFL.txt) — The Inter Project Authors |
| Fira Code | Loaded from Google Fonts | SIL Open Font License 1.1 | [Fira Code OFL](https://github.com/google/fonts/blob/main/ofl/firacode/OFL.txt) — The Fira Code Project Authors |

These resources are currently loaded from external CDNs by `dark_fantasy_2d_arpg_engine.html`; they are **not vendored into the repository**. Font families are requested through the Google Fonts stylesheet API. This inventory describes the current browser/HTML implementation, not future dependencies in the proposed Svelte/Phaser migration.

Tyto součásti se nyní načítají ze vzdálených CDN v `dark_fantasy_2d_arpg_engine.html` a **nejsou součástí repozitáře**. Jde o inventář současné HTML verze, nikoli automatický seznam budoucích závislostí Svelte/Phaser.

## Rules for new dependencies and assets / Pravidla pro nové závislosti a assety

- Preserve original license, copyright, attribution, and notice requirements for every third-party component. Do not label third-party work as GPL-3.0-only unless its rights holder has licensed it that way.
- Before committing third-party art, music, sounds, fonts, code, or packages, verify their licenses are compatible with the intended distribution and record their source, license, and any required notices here.
- If third-party material is copied into the repository or bundled for distribution, include the full relevant license text and notices where required. Links alone may not satisfy redistribution requirements.
- For generated releases, review both runtime dependencies and bundled assets; retain editable/source forms where required by their licenses.
- Do not add assets with unknown provenance or rights.

- U každé externí součásti zachovej původní licenci a požadované informace o autorech.
- Před přidáním cizích assetů nebo závislostí ověř kompatibilitu licence s distribucí hry a eviduj jejich původ.
- Pokud externí dílo začne být součástí repozitáře nebo výsledného balíčku, přilož celé licenční texty a upozornění, pokud to jeho licence vyžaduje.
