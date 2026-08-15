# Družinsko drevo

Preprosta, ne-komercialna spletna stran za družinsko drevo — podobno MyHeritage, a minimalistično.
Vanilla HTML/JS + Supabase (baza, auth, storage), vizualizacija z [family-chart](https://github.com/donatso/family-chart).

## Nastavitev

1. V `js/supabase-client.js` vstavi svoj **anon/public key**
   (Supabase dashboard → Project Settings → API → `anon` `public`).
2. Odpri `login.html` v brskalniku (ali postavi na kak statični hosting: GitHub Pages, Netlify, Vercel).
3. Prijavi se z e-mailom (magic link) — Supabase Auth mora imeti omogočen Email provider.

## Struktura

- `index.html` — prikaz družinskega drevesa
- `person.html` — dodajanje/urejanje osebe
- `login.html` — prijava
- `js/supabase-client.js` — Supabase konfiguracija
- `js/tree.js` — pretvorba podatkov iz baze v format za family-chart
- `js/person-form.js` — CRUD za osebe
- `sql/schema.sql` — shema baze (že aplicirana na Supabase projekt)

## Podatkovni model

- **people** — osnovni podatki o osebah
- **partnerships** — zakoni/partnerstva (ločeno od starševstva)
- **parent_child** — starš-otrok povezave (podpira biološko/posvojitev/pastorka)
- **media**, **media_people** — fotke/dokumenti, povezani na osebe

## TODO (naslednji koraki)

- [ ] Dodajanje partnerjev in staršev/otrok v `person.html`
- [ ] Upload fotk (Supabase Storage bucket)
- [ ] Povabila za družinske člane (invite flow)
- [ ] GitHub Pages / Vercel deploy
