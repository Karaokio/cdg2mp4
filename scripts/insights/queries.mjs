// The HogQL behind the insights page. Kept as named queries (not ad-hoc strings
// in the runner) so a number on the page can always be traced back to the exact
// query that produced it.
//
// PostHog applies an implicit LIMIT 100 to HogQL results when the query does not
// set one, which silently truncates group-by results. Every query here sets an
// explicit LIMIT for that reason.

/** Cities that are my own testing, excluded from the "outside" series. */
export const SELF_CITIES = ["San Diego"];

/** Cloud regions that show up as bot and scanner traffic, never real use. */
export const DATACENTER_CITIES = ["Council Bluffs", "Boardman", "Ashburn"];

const list = (xs) => xs.map((x) => `'${x.replace(/'/g, "''")}'`).join(",");

/** Per-day event counts, plus the same counts with self/datacenter removed. */
export const daily = () => `
SELECT toDate(timestamp) AS d,
       count(DISTINCT distinct_id) AS users,
       countIf(event='$pageview') AS views,
       countIf(event='conversion_started') AS started,
       countIf(event='conversion_succeeded') AS succeeded,
       countIf(event='conversion_failed') AS failed,
       countIf(event='download_clicked') AS downloads,
       countIf(event='pwa_installed') AS pwa,
       countIf(event='conversion_succeeded'
               AND properties.$geoip_city_name NOT IN (${list([...SELF_CITIES, ...DATACENTER_CITIES])})
              ) AS succeededExt
FROM events
GROUP BY d ORDER BY d LIMIT 400`;

/** Profiles by the day their ID first appeared (UUIDv7 mint == first event). */
export const newProfiles = () => `
SELECT toDate(firstSeen) AS d,
       count() AS newIds,
       countIf(city NOT IN (${list([...SELF_CITIES, ...DATACENTER_CITIES])})) AS newIdsExt
FROM (
  SELECT distinct_id,
         min(timestamp) AS firstSeen,
         any(properties.$geoip_city_name) AS city
  FROM events GROUP BY distinct_id LIMIT 100000
)
GROUP BY d ORDER BY d LIMIT 400`;

/**
 * What the distinct_id count actually contains. One ID is one browser profile
 * that has kept its local storage, never a person, so the raw count needs this
 * breakdown to mean anything.
 */
export const buckets = () => `
SELECT bucket, count() AS ids, sum(conv) AS conversions
FROM (
  SELECT distinct_id,
         multiIf(
           any(properties.$geoip_city_name) IN (${list(SELF_CITIES)}), 'self',
           any(properties.$geoip_city_name) IN (${list(DATACENTER_CITIES)}), 'datacenter',
           countIf(event='conversion_succeeded') > 0, 'converted',
           count() <= 1, 'bounced',
           'visited'
         ) AS bucket,
         countIf(event='conversion_succeeded') AS conv
  FROM events GROUP BY distinct_id LIMIT 100000
)
GROUP BY bucket ORDER BY ids DESC LIMIT 20`;

/** Failure reasons, so a spike can be explained rather than just noticed. */
export const failures = () => `
SELECT properties.reason AS reason,
       properties.stage AS stage,
       count() AS c,
       count(DISTINCT distinct_id) AS ids
FROM events
WHERE event='conversion_failed'
GROUP BY reason, stage ORDER BY c DESC LIMIT 40`;
