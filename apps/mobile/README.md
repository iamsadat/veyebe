# Veyebe mobile

The companion opens with representative offline data, persists decisions locally, and uses `EXPO_PUBLIC_API_URL` when available. It never reads or uploads repository source.

When the API is backed by Supabase, set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` — the app shows an email/password sign-in and sends the resulting token on pulse reads and recommendation actions. With those unset, it stays in open demo/local mode (no sign-in gate), matching the API.

The Living Constellation uses React Three Fiber Native. Users can switch to feature-list parity at any time; rendering failures fall back to the list, and system reduced-motion preferences stop continuous animation. Run on a physical device with `npm run start -w @veyebe/mobile` and scan the Expo QR code.
