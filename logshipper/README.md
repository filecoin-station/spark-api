# logshipper

If you ever create a new machine for this app, please also set the restart
policy (can't be set via fly.toml):

```bash
$ fly machine update <MACHINE ID> --restart always
```