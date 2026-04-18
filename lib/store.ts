import { configureStore } from "@reduxjs/toolkit";
import { adminApi } from "@/lib/api/admin-api";
import { clientApi } from "@/lib/api/client-api";

export const makeStore = () =>
  configureStore({
    reducer: {
      [adminApi.reducerPath]: adminApi.reducer,
      [clientApi.reducerPath]: clientApi.reducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(adminApi.middleware, clientApi.middleware),
  });

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];
