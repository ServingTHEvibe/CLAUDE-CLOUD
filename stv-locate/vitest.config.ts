import {defineConfig} from 'vitest/config';
export default defineConfig({resolve:{alias:{'cloudflare:workers':new URL('./tests/cloudflare-mock.ts',import.meta.url).pathname}},test:{environment:'jsdom',include:['tests/**/*.test.ts','tests/**/*.test.tsx'],clearMocks:true}});
