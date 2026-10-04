/**
 * Vercel Serverless Function entrypoint for Audiora.
 * Handles API routes, static asset serving, and Supabase synchronization.
 */
import { createRequestHandler } from '../backend/server.js';

const handler = createRequestHandler();

export default async function (req, res) {
  return handler(req, res);
}
