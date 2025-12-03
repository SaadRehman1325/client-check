import {defineSecret} from "firebase-functions/params";
import * as logger from "firebase-functions/logger";

// Define environment secret - this will be passed from the functions
let environmentSecret: ReturnType<typeof defineSecret> | null = null;

/**
 * Initialize environment secret (call this from functions)
 * @param {*} secret The environment secret
 */
export function setEnvironmentSecret(
  secret: ReturnType<typeof defineSecret>
): void {
  environmentSecret = secret;
}

/**
 * Get the current environment (defaults to 'prod')
 * Reads from ENVIRONMENT secret in Secret Manager
 * @return {("prod"|"dev")} The current environment
 */
export function getEnvironment(): "prod" | "dev" {
  if (environmentSecret) {
    try {
      const env = environmentSecret.value().toLowerCase().trim();
      if (env === "dev" || env === "development") {
        return "dev";
      }
      return "prod";
    } catch (error) {
      logger.warn("ENVIRONMENT secret not available, defaulting to prod", {
        error,
      });
      return "prod";
    }
  }
  // Fallback to process.env if secret not initialized
  const env = process.env.ENVIRONMENT || process.env.NODE_ENV;
  if (env === "dev" || env === "development") {
    return "dev";
  }
  return "prod";
}

/**
 * Get the secret name based on environment
 * @param {string} baseName - Base name of the secret
 * @return {string} Secret name with TEST_ prefix if dev, otherwise base name
 */
export function getSecretName(baseName: string): string {
  const env = getEnvironment();
  if (env === "dev") {
    return `TEST_${baseName}`;
  }
  return baseName;
}

/**
 * Helper to get secret value with fallback
 * Tries the environment-specific secret first, then falls back to the other
 * @param {*} prodSecret Production secret
 * @param {*} testSecret Test secret
 * @return {string} The secret value
 */
export function getSecretValue(
  prodSecret: ReturnType<typeof defineSecret>,
  testSecret: ReturnType<typeof defineSecret>
): string {
  const env = getEnvironment();

  if (env === "dev") {
    try {
      const value = testSecret.value();
      if (value && value.trim()) {
        logger.info("Using TEST secret", {secretName: testSecret.name});
        return value;
      }
    } catch (error) {
      logger.warn("TEST secret not available, trying prod", {error});
    }
    // Fallback to prod if test secret not available
    try {
      return prodSecret.value();
    } catch (error) {
      logger.error("Both TEST and PROD secrets unavailable", {error});
      throw error;
    }
  } else {
    // Prod environment - use prod secret
    try {
      const value = prodSecret.value();
      if (value && value.trim()) {
        logger.info("Using PROD secret", {secretName: prodSecret.name});
        return value;
      }
    } catch (error) {
      logger.error("PROD secret not available", {error});
      throw error;
    }
    throw new Error(`Secret ${prodSecret.name} is not configured`);
  }
}

