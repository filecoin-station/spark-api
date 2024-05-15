# logshipper

Run the following command to deploy the latest logshipper version:

```bash
$ fly deploy --file-local="/etc/vector/vector.toml=vector.toml"
```

If you ever create a new machine for this app, please also set the restart
policy (can't be set via `fly.toml`):

```bash
$ fly machine update --restart always <MACHINE ID>
```
