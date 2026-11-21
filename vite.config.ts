import { fileURLToPath } from 'node:url';
import { defineConfig } from "vite";
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  resolve:{
    alias:[{find:/^\.\/platform\.ts$/,replacement:fileURLToPath(new URL('./server/platform.cloudflare.ts',import.meta.url))}],
  },
  plugins: [
    vinext(),
    cloudflare({
      ...(process.env.CRM_LOCAL_TEST==='1'?{remoteBindings:false}:{}),
      persistState:{path:process.env.CRM_WORKER_STATE || '.cloudflare/state'},
      types:{includeRuntime:false},
      viteEnvironment: {
        name: "rsc",
        childEnvironments: ["ssr"],
      },
    }),
  ],
});
