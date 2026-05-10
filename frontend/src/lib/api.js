import axios from "axios";
import { supabase } from "@/lib/supabase";

const PRODUCTION_HOSTNAME = "globe.corteqs.net";

function getSameOriginApi() {
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}/api`;
  }
  return "/api";
}

function resolveApiBaseUrl() {
  const configured = (process.env.REACT_APP_BACKEND_URL || "").trim();
  const sameOriginApi = getSameOriginApi();
  const currentHostname = typeof window !== "undefined" ? window.location?.hostname : "";

  if (currentHostname === PRODUCTION_HOSTNAME) {
    return sameOriginApi;
  }

  if (!configured) {
    console.warn("REACT_APP_BACKEND_URL is not set. Falling back to same-origin /api.");
    return sameOriginApi;
  }

  try {
    const origin = new URL(configured).origin;
    return `${origin}/api`;
  } catch (error) {
    console.error(`Invalid REACT_APP_BACKEND_URL "${configured}". Falling back to same-origin /api.`, error);
    return sameOriginApi;
  }
}

export const API = resolveApiBaseUrl();

const client = axios.create({
  baseURL: API,
  withCredentials: true,
});

// Request interceptor: attach JWT token if available
client.interceptors.request.use(async (config) => {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  } catch (err) {
    console.warn("Failed to get session:", err);
  }
  return config;
});

// Response interceptor: handle 401 by clearing session
client.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      try {
        await supabase.auth.signOut();
      } catch (err) {
        console.warn("Failed to sign out on 401:", err);
      }
    }
    return Promise.reject(error);
  }
);

export default client;
