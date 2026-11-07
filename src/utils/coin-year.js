// Year Coin year-selection helpers.
//
// The default year rolls over in November: by then enough of the current
// year has been ridden to make a meaningful coin. From January through
// October the default stays on the previous (completed) year.

// Matches the worker-side lower bound in workers/strava-api.js (isValidYear)
export const EARLIEST_COIN_YEAR = 2000;

const NOVEMBER = 10; // Date#getMonth() is 0-indexed

export function getDefaultCoinYear(now = new Date()) {
    return now.getMonth() >= NOVEMBER ? now.getFullYear() : now.getFullYear() - 1;
}

export function getSelectableCoinYears(now = new Date()) {
    const years = [];
    for (let year = now.getFullYear(); year >= EARLIEST_COIN_YEAR; year--) {
        years.push(year);
    }
    return years;
}
