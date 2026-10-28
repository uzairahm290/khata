# کھاتہ

Abbu ke liye ek hi jagah do khatey. Pehle safhe par do darwaze hain, jo khata kholna ho us par click karein, phir login.

| Rasta | Kya hai |
| --- | --- |
| `/` | Home: دونوں کھاتوں کے کارڈ |
| `/farm/` | بکروں کا کھاتہ: janwaron ka record (بکری، بکرا، بھیڑ، بچہ)، rozana/mahana kharcha، fi janwar kharcha |
| `/madrassa/` | مدرسہ کا کھاتہ: [madrassa-khata](https://github.com/uzairahm290/madrassa-khata) ki copy, usi database se jurdi hui |

## Stack

- Plain HTML/CSS/JS, koi build step nahi
- Supabase project `madrassa-khata` (Postgres + Auth + RLS). Farm ki tables (`farm_animal`, `farm_expense`) isi project mein hain aur wahi `members` / `is_member()` policies use karti hain, is liye ek login dono khaton ke liye chalta hai
- Render static site

## Fi janwar kharcha kaise banta hai

Jo kharcha "سب جانور" par likha jaye (chara, bhoosa, mazdoori), wo us mahine ke mojood janwaron mein barabar baant diya jata hai. Jo kharcha kisi ek janwar par likha jaye (doctor, dawai), wo sirf usi ke hisaab mein jata hai.

## Files

| File | Kaam |
| --- | --- |
| `index.html` | Home page |
| `config.js` | Supabase URL aur publishable key (public key; data RLS se mehfooz) |
| `fonts/` | Jameel Noori Nastaleeq, dono khatey yahin se lete hain |
| `farm/` | بکروں کا کھاتہ |
| `madrassa/` | مدرسہ کا کھاتہ |
| `supabase/schema.sql` | Poora schema, farm migration samet |

## Local chalana

```
npx serve .
```
