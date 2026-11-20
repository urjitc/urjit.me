-- Each jam's tempo (src/features/looper/jam.ts). Jams from before were all at 100 BPM.
ALTER TABLE jams ADD COLUMN bpm INTEGER NOT NULL DEFAULT 100;
