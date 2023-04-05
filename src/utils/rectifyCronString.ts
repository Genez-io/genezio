

// Converts non-standard cron strings of the type X/Y * * * * to standard X-59/Y * * * *,
// applied to all fields.
export function rectifyCronString(cronString: string): string {
  const parts = cronString.split(' ');
  const minutes = parts[0].replace(/^(\d+)\/(\d+)$/, '$1-59/$2');
  const hours = parts[1].replace(/^(\d+)\/(\d+)$/, '$1-23/$2');
  const dom = parts[2].replace(/^(\d+)\/(\d+)$/, '$1-31/$2');
  const month = parts[3].replace(/^(\d+)\/(\d+)$/, '$1-12/$2');
  // for the day-of-week field, since 0 is Sunday, and strings like 2/1 go from Tuesday to Sunday
  // the holistic approach would be to convert it into a comma separated list of days, as a range
  // representation would be a bit heavy
  const dow = parts[4].replace(/^(\d+)\/(\d+)$/, (_, start, step) => {
    const end = 7; // set the end value to 6 for weekday fields
    const range = [];
    for (let i = parseInt(start); i <= end; i += parseInt(step)) {
      range.push(i);
    }
    return range.join(',') + '/' + step;
  }).replace('7', '0');
  return `${minutes} ${hours} ${dom} ${month} ${dow}`;
}