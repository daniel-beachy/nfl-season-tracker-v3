const rows = [
  ['2', 'BUF', 'Buffalo Bills', 'Bills', 'AFC', 'East', '00338d', 'd50a0a'],
  ['15', 'MIA', 'Miami Dolphins', 'Dolphins', 'AFC', 'East', '008e97', 'fc4c02'],
  ['17', 'NE', 'New England Patriots', 'Patriots', 'AFC', 'East', '002244', 'c60c30'],
  ['20', 'NYJ', 'New York Jets', 'Jets', 'AFC', 'East', '125740', 'ffffff'],
  ['33', 'BAL', 'Baltimore Ravens', 'Ravens', 'AFC', 'North', '241773', '9e7c0c'],
  ['4', 'CIN', 'Cincinnati Bengals', 'Bengals', 'AFC', 'North', 'fb4f14', '000000'],
  ['5', 'CLE', 'Cleveland Browns', 'Browns', 'AFC', 'North', '311d00', 'ff3c00'],
  ['23', 'PIT', 'Pittsburgh Steelers', 'Steelers', 'AFC', 'North', 'ffb612', '101820'],
  ['34', 'HOU', 'Houston Texans', 'Texans', 'AFC', 'South', '03202f', 'a71930'],
  ['11', 'IND', 'Indianapolis Colts', 'Colts', 'AFC', 'South', '002c5f', 'a2aaad'],
  ['30', 'JAX', 'Jacksonville Jaguars', 'Jaguars', 'AFC', 'South', '006778', 'd7a22a'],
  ['10', 'TEN', 'Tennessee Titans', 'Titans', 'AFC', 'South', '0c2340', '4b92db'],
  ['7', 'DEN', 'Denver Broncos', 'Broncos', 'AFC', 'West', 'fb4f14', '002244'],
  ['12', 'KC', 'Kansas City Chiefs', 'Chiefs', 'AFC', 'West', 'e31837', 'ffb81c'],
  ['13', 'LV', 'Las Vegas Raiders', 'Raiders', 'AFC', 'West', '000000', 'a5acaf'],
  ['24', 'LAC', 'Los Angeles Chargers', 'Chargers', 'AFC', 'West', '0080c6', 'ffc20e'],
  ['6', 'DAL', 'Dallas Cowboys', 'Cowboys', 'NFC', 'East', '003594', '869397'],
  ['19', 'NYG', 'New York Giants', 'Giants', 'NFC', 'East', '0b2265', 'a71930'],
  ['21', 'PHI', 'Philadelphia Eagles', 'Eagles', 'NFC', 'East', '004c54', 'a5acaf'],
  ['28', 'WSH', 'Washington Commanders', 'Commanders', 'NFC', 'East', '5a1414', 'ffb612'],
  ['3', 'CHI', 'Chicago Bears', 'Bears', 'NFC', 'North', '0b162a', 'c83803'],
  ['8', 'DET', 'Detroit Lions', 'Lions', 'NFC', 'North', '0076b6', 'b0b7bc'],
  ['9', 'GB', 'Green Bay Packers', 'Packers', 'NFC', 'North', '203731', 'ffb612'],
  ['16', 'MIN', 'Minnesota Vikings', 'Vikings', 'NFC', 'North', '4f2683', 'ffc62f'],
  ['1', 'ATL', 'Atlanta Falcons', 'Falcons', 'NFC', 'South', 'a71930', '000000'],
  ['29', 'CAR', 'Carolina Panthers', 'Panthers', 'NFC', 'South', '0085ca', '101820'],
  ['18', 'NO', 'New Orleans Saints', 'Saints', 'NFC', 'South', 'd3bc8d', '101820'],
  ['27', 'TB', 'Tampa Bay Buccaneers', 'Buccaneers', 'NFC', 'South', 'd50a0a', '34302b'],
  ['22', 'ARI', 'Arizona Cardinals', 'Cardinals', 'NFC', 'West', '97233f', 'ffb612'],
  ['14', 'LAR', 'Los Angeles Rams', 'Rams', 'NFC', 'West', '003594', 'ffd100'],
  ['25', 'SF', 'San Francisco 49ers', '49ers', 'NFC', 'West', 'aa0000', 'b3995d'],
  ['26', 'SEA', 'Seattle Seahawks', 'Seahawks', 'NFC', 'West', '002244', '69be28'],
];

export const TEAMS = rows.map(([id, abbreviation, name, shortName, conference, division, color, alternateColor]) => ({
  id, abbreviation, name, shortName, conference, division,
  color: `#${color}`, alternateColor: `#${alternateColor}`,
  logo: `https://a.espncdn.com/i/teamlogos/nfl/500/${abbreviation.toLowerCase()}.png`,
}));

export function adaptTeams(payload) {
  const entries = payload?.sports?.flatMap(s => s.leagues ?? []).flatMap(l => l.teams ?? []) ?? [];
  const byId = new Map(entries.map(entry => [String(entry.team?.id), entry.team]));
  if (TEAMS.some(t => !byId.has(t.id))) throw new Error('Team metadata did not contain all 32 NFL teams');
  const hex = (value, fallback) => /^[0-9a-f]{6}$/i.test(value ?? '') ? `#${value}` : fallback;
  return TEAMS.map(canonical => {
    const team = byId.get(canonical.id);
    const logo = team.logos?.find(l => l.rel?.includes('default'))?.href;
    return {
      ...canonical,
      name: team.displayName || canonical.name,
      shortName: team.shortDisplayName || team.name || canonical.shortName,
      abbreviation: team.abbreviation || canonical.abbreviation,
      color: hex(team.color, canonical.color),
      alternateColor: hex(team.alternateColor, canonical.alternateColor),
      logo: logo?.startsWith('https://a.espncdn.com/') ? logo : canonical.logo,
    };
  });
}
