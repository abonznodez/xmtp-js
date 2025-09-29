/**
 * Utility for resolving web3 names to Ethereum addresses
 */
import QuickLRU from "quick-lru";

export interface NameResolutionResult {
  address: `0x${string}` | null;
  platform: "ens" | "basenames" | "ethereum" | null;
  displayName: string | null;
}

export interface NameResolverConfig {
  web3BioApiKey?: string;
  batchSize?: number;
  cacheMaxSize?: number;
  cacheTTL?: number;
}

// Default configuration
const DEFAULT_CONFIG: Required<NameResolverConfig> = {
  web3BioApiKey: process.env.WEB3BIO_API_KEY || "",
  batchSize: 30,
  cacheMaxSize: 1000,
  cacheTTL: 15 * 60 * 1000, // 15 minutes in milliseconds
};

// Global configuration that can be updated
let resolverConfig: Required<NameResolverConfig> = { ...DEFAULT_CONFIG };

// Cache for name resolution results
let nameResolutionCache = new QuickLRU<string, NameResolutionResult>({
  maxSize: resolverConfig.cacheMaxSize,
  maxAge: resolverConfig.cacheTTL,
});

/**
 * Configure the name resolver
 *
 * @param config - Configuration options for the name resolver
 */
export function configureNameResolver(config: NameResolverConfig): void {
  resolverConfig = { ...resolverConfig, ...config };

  // Recreate cache with new settings if cache-related config changed
  if (config.cacheMaxSize !== undefined || config.cacheTTL !== undefined) {
    nameResolutionCache = new QuickLRU<string, NameResolutionResult>({
      maxSize: resolverConfig.cacheMaxSize,
      maxAge: resolverConfig.cacheTTL,
    });
  }
}

/**
 * Get current name resolver configuration
 */
export function getNameResolverConfig(): Required<NameResolverConfig> {
  return { ...resolverConfig };
}

/**
 * Web3Bio API response interface
 */
interface Web3BioResponse {
  address?: string;
  identity?: string;
  platform?: string;
  displayName?: string;
}

/**
 * Make a request to Web3Bio API with optional API key
 */
async function fetchFromWeb3Bio(
  path: string,
): Promise<Web3BioResponse[] | null> {
  try {
    const headers: Record<string, string> = {};
    if (resolverConfig.web3BioApiKey) {
      headers["X-API-KEY"] = `Bearer ${resolverConfig.web3BioApiKey}`;
    }

    const response = await fetch(`https://api.web3.bio${path}`, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return Array.isArray(data) ? data : [data];
  } catch (error) {
    console.warn("Failed to fetch from Web3Bio:", error);
    return null;
  }
}

/**
 * Resolve multiple names using Web3Bio batch API
 */
async function resolveBatchFromWeb3Bio(
  names: string[],
): Promise<Map<string, NameResolutionResult>> {
  const results = new Map<string, NameResolutionResult>();

  if (names.length === 0) {
    return results;
  }

  try {
    // Create batch request - Web3Bio expects array of names
    const escapedNames = encodeURIComponent(JSON.stringify(names));
    const data = await fetchFromWeb3Bio(`/ns/batch/${escapedNames}`);

    if (!data) {
      // If batch fails, mark all as failed
      names.forEach((name) => {
        results.set(name, {
          address: null,
          platform: null,
          displayName: null,
        });
      });
      return results;
    }

    // Process batch response
    const responseMap = new Map<string, Web3BioResponse>();
    data.forEach((item) => {
      if (item.identity) {
        responseMap.set(item.identity.toLowerCase(), item);
      }
    });

    // Create results for each requested name
    names.forEach((name) => {
      const cleanName = name.toLowerCase();
      const response = responseMap.get(cleanName);

      if (response && response.address && isEthereumAddress(response.address)) {
        results.set(name, {
          address: response.address,
          platform: isBaseName(cleanName) ? "basenames" : "ens",
          displayName: cleanName,
        });
      } else {
        results.set(name, {
          address: null,
          platform: null,
          displayName: null,
        });
      }
    });

    return results;
  } catch (error) {
    console.warn("Failed to resolve batch from Web3Bio:", error);

    // Mark all as failed if batch request fails
    names.forEach((name) => {
      results.set(name, {
        address: null,
        platform: null,
        displayName: null,
      });
    });

    return results;
  }
}

/**
 * Checks if a string is a valid Ethereum address
 */
function isEthereumAddress(input: string): input is `0x${string}` {
  return /^0x[a-fA-F0-9]{40}$/.test(input);
}

/**
 * Checks if a string is an ENS name
 */
function isEnsName(input: string): boolean {
  return input.endsWith(".eth") && !input.endsWith(".base.eth");
}

/**
 * Checks if a string is a Base name
 */
function isBaseName(input: string): boolean {
  return input.endsWith(".base.eth");
}

/**
 * Resolves Base names using the web3.bio API
 */
async function resolveBaseName(name: string): Promise<`0x${string}` | null> {
  try {
    const data = await fetchFromWeb3Bio(`/ns/${encodeURIComponent(name)}`);

    if (data && data.length > 0 && data[0].address) {
      const address = data[0].address;
      return isEthereumAddress(address) ? address : null;
    }

    return null;
  } catch (error) {
    console.warn("Failed to resolve Base name:", error);
    return null;
  }
}

/**
 * Resolves ENS names using the web3.bio API
 */
async function resolveEnsName(name: string): Promise<`0x${string}` | null> {
  try {
    const data = await fetchFromWeb3Bio(`/ns/${encodeURIComponent(name)}`);

    if (data && data.length > 0 && data[0].address) {
      const address = data[0].address;
      return isEthereumAddress(address) ? address : null;
    }

    return null;
  } catch (error) {
    console.warn("Failed to resolve ENS name:", error);
    return null;
  }
}

/**
 * Resolves a name or address to an Ethereum address
 *
 * @param input - Can be an Ethereum address, ENS name, or Base name
 * @returns Promise that resolves to name resolution result
 */
export async function resolveName(
  input: string,
): Promise<NameResolutionResult> {
  const cleanInput = input.trim().toLowerCase();

  // Check cache first
  const cacheKey = cleanInput;
  const cachedResult = nameResolutionCache.get(cacheKey);
  if (cachedResult) {
    return cachedResult;
  }

  let result: NameResolutionResult;

  // If it's already an Ethereum address, return it directly
  if (isEthereumAddress(cleanInput)) {
    result = {
      address: cleanInput,
      platform: "ethereum",
      displayName: null,
    };
  }
  // If it's a Base name, resolve it
  else if (isBaseName(cleanInput)) {
    const address = await resolveBaseName(cleanInput);
    result = {
      address,
      platform: address ? "basenames" : null,
      displayName: address ? cleanInput : null,
    };
  }
  // If it's an ENS name, resolve it
  else if (isEnsName(cleanInput)) {
    const address = await resolveEnsName(cleanInput);
    result = {
      address,
      platform: address ? "ens" : null,
      displayName: address ? cleanInput : null,
    };
  }
  // If we can't identify the format, return null
  else {
    result = {
      address: null,
      platform: null,
      displayName: null,
    };
  }

  // Cache the result (including failed resolutions to avoid repeated API calls)
  nameResolutionCache.set(cacheKey, result);

  return result;
}

/**
 * Resolves multiple names to addresses in parallel using batching for efficiency
 *
 * @param inputs - Array of names or addresses to resolve
 * @returns Promise that resolves to array of resolution results
 */
export async function resolveNames(
  inputs: string[],
): Promise<NameResolutionResult[]> {
  if (inputs.length === 0) {
    return [];
  }

  // Clean and deduplicate inputs while preserving original order
  const cleanInputs = inputs.map((input) => input.trim().toLowerCase());
  const uniqueInputs = [...new Set(cleanInputs)];

  // Separate addresses from names that need resolution
  const addresses: string[] = [];
  const namesToResolve: string[] = [];
  const resolvedResults = new Map<string, NameResolutionResult>();

  // Process each unique input
  for (const input of uniqueInputs) {
    // Check cache first
    const cachedResult = nameResolutionCache.get(input);
    if (cachedResult) {
      resolvedResults.set(input, cachedResult);
      continue;
    }

    // If it's already an Ethereum address, handle directly
    if (isEthereumAddress(input)) {
      const result: NameResolutionResult = {
        address: input,
        platform: "ethereum",
        displayName: null,
      };
      resolvedResults.set(input, result);
      nameResolutionCache.set(input, result);
      addresses.push(input);
    } else if (isEnsName(input) || isBaseName(input)) {
      namesToResolve.push(input);
    } else {
      // Invalid format
      const result: NameResolutionResult = {
        address: null,
        platform: null,
        displayName: null,
      };
      resolvedResults.set(input, result);
      nameResolutionCache.set(input, result);
    }
  }

  // Batch resolve names that aren't cached
  if (namesToResolve.length > 0) {
    // Process in batches
    const batchPromises: Promise<void>[] = [];

    for (let i = 0; i < namesToResolve.length; i += resolverConfig.batchSize) {
      const batch = namesToResolve.slice(i, i + resolverConfig.batchSize);

      const batchPromise = resolveBatchFromWeb3Bio(batch).then(
        (batchResults) => {
          // Cache and store results
          for (const [name, result] of batchResults) {
            resolvedResults.set(name, result);
            nameResolutionCache.set(name, result);
          }
        },
      );

      batchPromises.push(batchPromise);
    }

    // Wait for all batch requests to complete
    await Promise.all(batchPromises);
  }

  // Return results in original order
  return cleanInputs.map((input) => resolvedResults.get(input)!);
}

/**
 * Cache management utilities
 */

/**
 * Clear the name resolution cache
 */
export function clearNameResolutionCache(): void {
  nameResolutionCache.clear();
}

/**
 * Get cache statistics
 */
export function getNameResolutionCacheStats() {
  return {
    size: nameResolutionCache.size,
    maxSize: nameResolutionCache.maxSize,
  };
}

/**
 * Remove a specific entry from the cache
 *
 * @param input - The name or address to remove from cache
 */
export function evictFromNameResolutionCache(input: string): boolean {
  const cacheKey = input.trim().toLowerCase();
  return nameResolutionCache.delete(cacheKey);
}
