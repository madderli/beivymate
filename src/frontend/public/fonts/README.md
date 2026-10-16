# Login page fonts

Nunito 400 / 600 and LXGW WenKai TC 400 are served locally. Their SIL Open Font License texts are included alongside the font files.

Sources: Google Fonts CSS API, https://fonts.google.com/specimen/Nunito and https://fonts.google.com/specimen/LXGW+WenKai+TC. Nunito license retrieved from the @fontsource/nunito package; WenKai license from the Google Fonts repository.

The WenKai file is the Google Fonts subset requested for static Chinese interface strings in AuthLayout.tsx and Account.tsx. Other glyphs fall back to the system font. Extend the subset when adding Chinese login-page copy. No external font requests occur at page runtime.
