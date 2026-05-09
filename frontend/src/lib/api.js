import axios from "axios";
import { supabase } from "@/lib/supabase";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const client = axios.create({
  baseURL: API,
  withCredentials: true, // send Emergent httpOnly cookie
});

client.interceptors.request.use(async (config) => {
  // Attach Supabase JWT if available
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default client;
