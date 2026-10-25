import companies from "../data/companies.json" with { type: "json" };

const SECOND_LEVEL = ["ac", "co", "com", "edu", "go", "gov", "gv", "ne", "net", "or", "org"];

const hostToKey = new Map(
    Object.entries(companies).flatMap(([key, company]) => company.hosts.map((host) => [host, key]))
);

/**
 * Returns `{ key, name, known }` for a host. The host and each parent domain are looked up in
 * `companies.json`; without a match, the base domain of the host is key and name.
 */
export function resolveCompany(host) {
    let candidate = host.toLowerCase();
    while (candidate.includes(".")) {
        const key = hostToKey.get(candidate);
        if (key) return { key, name: companies[key].name, known: true };
        candidate = candidate.slice(candidate.indexOf(".") + 1);
    }
    const domain = baseDomain(host.toLowerCase());
    return { key: domain, name: domain, known: false };
}

/**
 * Returns the last two labels of a host, or the last three when the second-to-last label is a
 * generic second level (`co`, `com`, …) under a two-letter country code, e.g. `example.co.uk`.
 * IP addresses are returned unchanged.
 */
function baseDomain(host) {
    if (host.includes(":") || /^\d+(\.\d+){3}$/.test(host)) return host;
    const labels = host.split(".");
    if (labels.length <= 2) return host;
    const tld = labels.at(-1);
    const second = labels.at(-2);
    const count = tld.length === 2 && SECOND_LEVEL.includes(second) ? 3 : 2;
    return labels.slice(-count).join(".");
}