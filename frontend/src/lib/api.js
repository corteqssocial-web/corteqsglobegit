import axios from "axios";
import { supabase } from "@/lib/supabase";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const client = axios.create({
  baseURL: API,
  withCredentials: true, // send Emergent httpOnly cookie
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
