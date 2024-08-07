CREATE TABLE allocator_clients (
  allocator_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  PRIMARY KEY (allocator_id, client_id)
);

CREATE INDEX allocator_clients_allocator_id ON allocator_clients (allocator_id);
CREATE INDEX allocator_clients_client_id ON allocator_clients (client_id);
