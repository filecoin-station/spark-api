CREATE TABLE network_info_update_history (
    day DATE NOT NULL,
    station_id TEXT NOT NULL,
    PRIMARY KEY (day, station_id)
);
CREATE INDEX network_info_update_history_day_idx ON network_info_update_history (day);
