/**
 * Seed Database with Tournament Squads
 * =====================================
 * POST /api/seed/players?tournament=t20_wc_2026
 * 
 * This populates the database with actual squad data.
 * No external API needed - squads are hardcoded.
 */

import { createClient } from '@libsql/client';

let db = null;
let dbError = null;

try {
  if (process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN) {
    db = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  } else {
    dbError = 'Missing database credentials';
  }
} catch (e) {
  dbError = e.message;
}

// ============================================
// ACTUAL TOURNAMENT SQUADS
// ============================================

const SQUADS = {
  // T20 World Cup 2026 - 20 teams, ~15 players each
  t20_wc_2026: [
    // INDIA
    { name: 'Rohit Sharma', team: 'IND', position: 'batter', price: 12.0, avgPoints: 42 },
    { name: 'Virat Kohli', team: 'IND', position: 'batter', price: 12.5, avgPoints: 45 },
    { name: 'Suryakumar Yadav', team: 'IND', position: 'batter', price: 11.5, avgPoints: 46 },
    { name: 'Shubman Gill', team: 'IND', position: 'batter', price: 10.0, avgPoints: 40 },
    { name: 'Yashasvi Jaiswal', team: 'IND', position: 'batter', price: 10.0, avgPoints: 40 },
    { name: 'Rishabh Pant', team: 'IND', position: 'keeper', price: 10.5, avgPoints: 40 },
    { name: 'Hardik Pandya', team: 'IND', position: 'allrounder', price: 11.0, avgPoints: 42 },
    { name: 'Ravindra Jadeja', team: 'IND', position: 'allrounder', price: 10.0, avgPoints: 38 },
    { name: 'Axar Patel', team: 'IND', position: 'allrounder', price: 9.0, avgPoints: 35 },
    { name: 'Jasprit Bumrah', team: 'IND', position: 'bowler', price: 12.0, avgPoints: 42 },
    { name: 'Mohammed Shami', team: 'IND', position: 'bowler', price: 10.0, avgPoints: 36 },
    { name: 'Arshdeep Singh', team: 'IND', position: 'bowler', price: 9.5, avgPoints: 36 },
    { name: 'Kuldeep Yadav', team: 'IND', position: 'bowler', price: 9.0, avgPoints: 35 },
    { name: 'Yuzvendra Chahal', team: 'IND', position: 'bowler', price: 8.5, avgPoints: 33 },
    { name: 'Sanju Samson', team: 'IND', position: 'keeper', price: 9.0, avgPoints: 35 },

    // AUSTRALIA
    { name: 'David Warner', team: 'AUS', position: 'batter', price: 10.5, avgPoints: 40 },
    { name: 'Travis Head', team: 'AUS', position: 'batter', price: 10.5, avgPoints: 42 },
    { name: 'Steve Smith', team: 'AUS', position: 'batter', price: 10.0, avgPoints: 38 },
    { name: 'Glenn Maxwell', team: 'AUS', position: 'allrounder', price: 10.5, avgPoints: 42 },
    { name: 'Mitchell Marsh', team: 'AUS', position: 'allrounder', price: 9.5, avgPoints: 36 },
    { name: 'Marcus Stoinis', team: 'AUS', position: 'allrounder', price: 9.0, avgPoints: 35 },
    { name: 'Josh Inglis', team: 'AUS', position: 'keeper', price: 9.0, avgPoints: 34 },
    { name: 'Matthew Wade', team: 'AUS', position: 'keeper', price: 8.5, avgPoints: 32 },
    { name: 'Pat Cummins', team: 'AUS', position: 'bowler', price: 10.5, avgPoints: 38 },
    { name: 'Mitchell Starc', team: 'AUS', position: 'bowler', price: 10.5, avgPoints: 38 },
    { name: 'Josh Hazlewood', team: 'AUS', position: 'bowler', price: 9.5, avgPoints: 35 },
    { name: 'Adam Zampa', team: 'AUS', position: 'bowler', price: 9.0, avgPoints: 35 },
    { name: 'Nathan Ellis', team: 'AUS', position: 'bowler', price: 8.5, avgPoints: 32 },
    { name: 'Tim David', team: 'AUS', position: 'batter', price: 9.5, avgPoints: 36 },
    { name: 'Cameron Green', team: 'AUS', position: 'allrounder', price: 9.0, avgPoints: 34 },

    // ENGLAND
    { name: 'Jos Buttler', team: 'ENG', position: 'keeper', price: 11.5, avgPoints: 45 },
    { name: 'Phil Salt', team: 'ENG', position: 'batter', price: 10.0, avgPoints: 40 },
    { name: 'Harry Brook', team: 'ENG', position: 'batter', price: 10.0, avgPoints: 40 },
    { name: 'Jonny Bairstow', team: 'ENG', position: 'batter', price: 9.5, avgPoints: 38 },
    { name: 'Ben Duckett', team: 'ENG', position: 'batter', price: 9.0, avgPoints: 36 },
    { name: 'Liam Livingstone', team: 'ENG', position: 'allrounder', price: 9.0, avgPoints: 36 },
    { name: 'Moeen Ali', team: 'ENG', position: 'allrounder', price: 8.5, avgPoints: 32 },
    { name: 'Sam Curran', team: 'ENG', position: 'allrounder', price: 9.0, avgPoints: 35 },
    { name: 'Ben Stokes', team: 'ENG', position: 'allrounder', price: 10.0, avgPoints: 38 },
    { name: 'Jofra Archer', team: 'ENG', position: 'bowler', price: 10.0, avgPoints: 38 },
    { name: 'Mark Wood', team: 'ENG', position: 'bowler', price: 9.5, avgPoints: 36 },
    { name: 'Adil Rashid', team: 'ENG', position: 'bowler', price: 9.0, avgPoints: 35 },
    { name: 'Chris Woakes', team: 'ENG', position: 'bowler', price: 8.5, avgPoints: 33 },
    { name: 'Reece Topley', team: 'ENG', position: 'bowler', price: 8.5, avgPoints: 32 },
    { name: 'Will Jacks', team: 'ENG', position: 'allrounder', price: 8.5, avgPoints: 34 },

    // PAKISTAN
    { name: 'Babar Azam', team: 'PAK', position: 'batter', price: 12.0, avgPoints: 44 },
    { name: 'Mohammad Rizwan', team: 'PAK', position: 'keeper', price: 10.5, avgPoints: 42 },
    { name: 'Fakhar Zaman', team: 'PAK', position: 'batter', price: 9.5, avgPoints: 36 },
    { name: 'Saim Ayub', team: 'PAK', position: 'batter', price: 9.0, avgPoints: 35 },
    { name: 'Iftikhar Ahmed', team: 'PAK', position: 'allrounder', price: 8.5, avgPoints: 32 },
    { name: 'Shadab Khan', team: 'PAK', position: 'allrounder', price: 9.0, avgPoints: 35 },
    { name: 'Imad Wasim', team: 'PAK', position: 'allrounder', price: 8.0, avgPoints: 30 },
    { name: 'Shaheen Afridi', team: 'PAK', position: 'bowler', price: 10.5, avgPoints: 38 },
    { name: 'Haris Rauf', team: 'PAK', position: 'bowler', price: 9.0, avgPoints: 34 },
    { name: 'Naseem Shah', team: 'PAK', position: 'bowler', price: 9.0, avgPoints: 34 },
    { name: 'Mohammad Nawaz', team: 'PAK', position: 'allrounder', price: 8.5, avgPoints: 32 },
    { name: 'Usama Mir', team: 'PAK', position: 'bowler', price: 8.0, avgPoints: 30 },
    { name: 'Azam Khan', team: 'PAK', position: 'keeper', price: 8.0, avgPoints: 30 },
    { name: 'Mohammad Hasnain', team: 'PAK', position: 'bowler', price: 8.0, avgPoints: 30 },
    { name: 'Abrar Ahmed', team: 'PAK', position: 'bowler', price: 8.5, avgPoints: 32 },

    // SOUTH AFRICA
    { name: 'Quinton de Kock', team: 'SA', position: 'keeper', price: 10.5, avgPoints: 42 },
    { name: 'Aiden Markram', team: 'SA', position: 'batter', price: 9.5, avgPoints: 36 },
    { name: 'Rassie van der Dussen', team: 'SA', position: 'batter', price: 9.0, avgPoints: 35 },
    { name: 'David Miller', team: 'SA', position: 'batter', price: 9.5, avgPoints: 38 },
    { name: 'Heinrich Klaasen', team: 'SA', position: 'keeper', price: 10.0, avgPoints: 40 },
    { name: 'Tristan Stubbs', team: 'SA', position: 'batter', price: 8.5, avgPoints: 32 },
    { name: 'Marco Jansen', team: 'SA', position: 'allrounder', price: 9.0, avgPoints: 35 },
    { name: 'Kagiso Rabada', team: 'SA', position: 'bowler', price: 10.0, avgPoints: 38 },
    { name: 'Anrich Nortje', team: 'SA', position: 'bowler', price: 9.5, avgPoints: 36 },
    { name: 'Lungi Ngidi', team: 'SA', position: 'bowler', price: 8.5, avgPoints: 32 },
    { name: 'Tabraiz Shamsi', team: 'SA', position: 'bowler', price: 8.5, avgPoints: 32 },
    { name: 'Keshav Maharaj', team: 'SA', position: 'bowler', price: 8.0, avgPoints: 30 },
    { name: 'Reeza Hendricks', team: 'SA', position: 'batter', price: 8.5, avgPoints: 33 },
    { name: 'Ryan Rickelton', team: 'SA', position: 'keeper', price: 8.0, avgPoints: 30 },
    { name: 'Gerald Coetzee', team: 'SA', position: 'bowler', price: 8.5, avgPoints: 33 },

    // NEW ZEALAND
    { name: 'Kane Williamson', team: 'NZ', position: 'batter', price: 10.0, avgPoints: 38 },
    { name: 'Devon Conway', team: 'NZ', position: 'batter', price: 10.0, avgPoints: 40 },
    { name: 'Finn Allen', team: 'NZ', position: 'batter', price: 9.5, avgPoints: 38 },
    { name: 'Glenn Phillips', team: 'NZ', position: 'keeper', price: 10.0, avgPoints: 40 },
    { name: 'Daryl Mitchell', team: 'NZ', position: 'allrounder', price: 9.5, avgPoints: 36 },
    { name: 'Mitchell Santner', team: 'NZ', position: 'allrounder', price: 9.0, avgPoints: 34 },
    { name: 'Rachin Ravindra', team: 'NZ', position: 'allrounder', price: 9.0, avgPoints: 35 },
    { name: 'Lockie Ferguson', team: 'NZ', position: 'bowler', price: 10.0, avgPoints: 38 },
    { name: 'Trent Boult', team: 'NZ', position: 'bowler', price: 10.0, avgPoints: 36 },
    { name: 'Tim Southee', team: 'NZ', position: 'bowler', price: 9.0, avgPoints: 33 },
    { name: 'Matt Henry', team: 'NZ', position: 'bowler', price: 8.5, avgPoints: 32 },
    { name: 'Ish Sodhi', team: 'NZ', position: 'bowler', price: 8.5, avgPoints: 32 },
    { name: 'Mark Chapman', team: 'NZ', position: 'batter', price: 8.5, avgPoints: 33 },
    { name: 'Michael Bracewell', team: 'NZ', position: 'allrounder', price: 8.0, avgPoints: 30 },
    { name: 'Tom Latham', team: 'NZ', position: 'keeper', price: 8.5, avgPoints: 32 },

    // WEST INDIES
    { name: 'Brandon King', team: 'WI', position: 'batter', price: 9.0, avgPoints: 35 },
    { name: 'Kyle Mayers', team: 'WI', position: 'allrounder', price: 9.0, avgPoints: 35 },
    { name: 'Nicholas Pooran', team: 'WI', position: 'keeper', price: 10.0, avgPoints: 40 },
    { name: 'Rovman Powell', team: 'WI', position: 'batter', price: 9.0, avgPoints: 35 },
    { name: 'Andre Russell', team: 'WI', position: 'allrounder', price: 11.0, avgPoints: 42 },
    { name: 'Sunil Narine', team: 'WI', position: 'allrounder', price: 10.0, avgPoints: 38 },
    { name: 'Shimron Hetmyer', team: 'WI', position: 'batter', price: 9.0, avgPoints: 35 },
    { name: 'Akeal Hosein', team: 'WI', position: 'bowler', price: 8.5, avgPoints: 32 },
    { name: 'Alzarri Joseph', team: 'WI', position: 'bowler', price: 9.0, avgPoints: 34 },
    { name: 'Obed McCoy', team: 'WI', position: 'bowler', price: 8.0, avgPoints: 30 },
    { name: 'Gudakesh Motie', team: 'WI', position: 'bowler', price: 8.0, avgPoints: 30 },
    { name: 'Shai Hope', team: 'WI', position: 'keeper', price: 9.0, avgPoints: 35 },
    { name: 'Roston Chase', team: 'WI', position: 'allrounder', price: 8.0, avgPoints: 30 },
    { name: 'Romario Shepherd', team: 'WI', position: 'allrounder', price: 8.5, avgPoints: 32 },
    { name: 'Jason Holder', team: 'WI', position: 'allrounder', price: 8.5, avgPoints: 33 },

    // SRI LANKA
    { name: 'Pathum Nissanka', team: 'SL', position: 'batter', price: 9.5, avgPoints: 38 },
    { name: 'Kusal Mendis', team: 'SL', position: 'keeper', price: 9.5, avgPoints: 38 },
    { name: 'Charith Asalanka', team: 'SL', position: 'batter', price: 9.0, avgPoints: 35 },
    { name: 'Bhanuka Rajapaksa', team: 'SL', position: 'batter', price: 8.5, avgPoints: 32 },
    { name: 'Dasun Shanaka', team: 'SL', position: 'allrounder', price: 8.5, avgPoints: 32 },
    { name: 'Wanindu Hasaranga', team: 'SL', position: 'allrounder', price: 10.0, avgPoints: 38 },
    { name: 'Dhananjaya de Silva', team: 'SL', position: 'allrounder', price: 8.5, avgPoints: 32 },
    { name: 'Maheesh Theekshana', team: 'SL', position: 'bowler', price: 9.0, avgPoints: 35 },
    { name: 'Matheesha Pathirana', team: 'SL', position: 'bowler', price: 9.0, avgPoints: 35 },
    { name: 'Dilshan Madushanka', team: 'SL', position: 'bowler', price: 8.5, avgPoints: 32 },
    { name: 'Dushmantha Chameera', team: 'SL', position: 'bowler', price: 8.0, avgPoints: 30 },
    { name: 'Nuwan Thushara', team: 'SL', position: 'bowler', price: 8.0, avgPoints: 30 },
    { name: 'Kusal Perera', team: 'SL', position: 'keeper', price: 8.5, avgPoints: 33 },
    { name: 'Sadeera Samarawickrama', team: 'SL', position: 'batter', price: 8.0, avgPoints: 30 },
    { name: 'Dunith Wellalage', team: 'SL', position: 'allrounder', price: 8.0, avgPoints: 30 },

    // BANGLADESH
    { name: 'Shakib Al Hasan', team: 'BAN', position: 'allrounder', price: 9.5, avgPoints: 36 },
    { name: 'Litton Das', team: 'BAN', position: 'keeper', price: 8.5, avgPoints: 32 },
    { name: 'Najmul Hossain Shanto', team: 'BAN', position: 'batter', price: 8.5, avgPoints: 32 },
    { name: 'Towhid Hridoy', team: 'BAN', position: 'batter', price: 8.0, avgPoints: 30 },
    { name: 'Mahmudullah', team: 'BAN', position: 'allrounder', price: 8.0, avgPoints: 30 },
    { name: 'Mehidy Hasan Miraz', team: 'BAN', position: 'allrounder', price: 8.0, avgPoints: 30 },
    { name: 'Mustafizur Rahman', team: 'BAN', position: 'bowler', price: 8.5, avgPoints: 32 },
    { name: 'Taskin Ahmed', team: 'BAN', position: 'bowler', price: 8.0, avgPoints: 30 },
    { name: 'Tanzim Hasan', team: 'BAN', position: 'bowler', price: 7.5, avgPoints: 28 },
    { name: 'Rishad Hossain', team: 'BAN', position: 'bowler', price: 7.5, avgPoints: 28 },
    { name: 'Tanzid Hasan', team: 'BAN', position: 'batter', price: 7.5, avgPoints: 28 },
    { name: 'Afif Hossain', team: 'BAN', position: 'allrounder', price: 7.5, avgPoints: 28 },
    { name: 'Soumya Sarkar', team: 'BAN', position: 'batter', price: 7.5, avgPoints: 28 },
    { name: 'Nasum Ahmed', team: 'BAN', position: 'bowler', price: 7.5, avgPoints: 28 },
    { name: 'Shoriful Islam', team: 'BAN', position: 'bowler', price: 7.5, avgPoints: 28 },

    // AFGHANISTAN
    { name: 'Rahmanullah Gurbaz', team: 'AFG', position: 'keeper', price: 9.5, avgPoints: 38 },
    { name: 'Ibrahim Zadran', team: 'AFG', position: 'batter', price: 8.5, avgPoints: 32 },
    { name: 'Gulbadin Naib', team: 'AFG', position: 'allrounder', price: 8.0, avgPoints: 30 },
    { name: 'Mohammad Nabi', team: 'AFG', position: 'allrounder', price: 8.5, avgPoints: 32 },
    { name: 'Najibullah Zadran', team: 'AFG', position: 'batter', price: 8.5, avgPoints: 32 },
    { name: 'Rashid Khan', team: 'AFG', position: 'bowler', price: 11.0, avgPoints: 40 },
    { name: 'Mujeeb Ur Rahman', team: 'AFG', position: 'bowler', price: 8.5, avgPoints: 32 },
    { name: 'Fazalhaq Farooqi', team: 'AFG', position: 'bowler', price: 8.5, avgPoints: 32 },
    { name: 'Naveen-ul-Haq', team: 'AFG', position: 'bowler', price: 8.0, avgPoints: 30 },
    { name: 'Azmatullah Omarzai', team: 'AFG', position: 'allrounder', price: 8.0, avgPoints: 30 },
    { name: 'Hazratullah Zazai', team: 'AFG', position: 'batter', price: 8.0, avgPoints: 30 },
    { name: 'Karim Janat', team: 'AFG', position: 'allrounder', price: 7.5, avgPoints: 28 },
    { name: 'Noor Ahmad', team: 'AFG', position: 'bowler', price: 8.0, avgPoints: 30 },
    { name: 'Fareed Ahmad', team: 'AFG', position: 'bowler', price: 7.5, avgPoints: 28 },
    { name: 'Hashmatullah Shahidi', team: 'AFG', position: 'batter', price: 7.5, avgPoints: 28 },

    // IRELAND
    { name: 'Paul Stirling', team: 'IRE', position: 'batter', price: 8.5, avgPoints: 32 },
    { name: 'Andrew Balbirnie', team: 'IRE', position: 'batter', price: 8.0, avgPoints: 30 },
    { name: 'Lorcan Tucker', team: 'IRE', position: 'keeper', price: 8.0,