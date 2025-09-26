/**
 * Utility for resolving web3 names to Ethereum addresses
 */

export interface NameResolutionResult {
  address: `0x${string}` | null;
  platform: "ens" | "basenames" | "ethereum" | null;
  displayName: string | null;
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
    const response = await fetch(
      `https://api.web3.bio/ns/${encodeURIComponent(name)}`,
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    // web3.bio returns an array of results, we take the first one
    if (Array.isArray(data) && data.length > 0 && data[0].address) {
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
    const response = await fetch(
      `https://api.web3.bio/ns/${encodeURIComponent(name)}`,
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    // web3.bio returns an array of results, we take the first one
    if (Array.isArray(data) && data.length > 0 && data[0].address) {
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

  // If it's already an Ethereum address, return it directly
  if (isEthereumAddress(cleanInput)) {
    return {
      address: cleanInput,
      platform: "ethereum",
      displayName: null,
    };
  }

  // If it's a Base name, resolve it
  if (isBaseName(cleanInput)) {
    const address = await resolveBaseName(cleanInput);
    return {
      address,
      platform: address ? "basenames" : null,
      displayName: address ? cleanInput : null,
    };
  }

  // If it's an ENS name, resolve it
  if (isEnsName(cleanInput)) {
    const address = await resolveEnsName(cleanInput);
    return {
      address,
      platform: address ? "ens" : null,
      displayName: address ? cleanInput : null,
    };
  }

  // If we can't identify the format, return null
  return {
    address: null,
    platform: null,
    displayName: null,
  };
}

/**
 * Resolves multiple names to addresses in parallel
 *
 * @param inputs - Array of names or addresses to resolve
 * @returns Promise that resolves to array of resolution results
 */
export async function resolveNames(
  inputs: string[],
): Promise<NameResolutionResult[]> {
  return Promise.all(inputs.map(resolveName));
}
