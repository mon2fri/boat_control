# Docker on Windows

Install [Docker Desktop](https://docs.docker.com/desktop/setup/install/windows-install/)
and select Linux containers (the WSL 2 backend is supported). Run these commands
in PowerShell from the repository root on `main`. Docker builds the frontend and
installs Python dependencies inside Linux; local Python, Node, and npm are not needed.

```powershell
docker compose up --build -d
docker compose logs -f
```

Open http://localhost:45303. Configure ports directly in `docker-compose.yml`:

```yaml
    environment:
      BOAT_CONTROL_PORT: "45303"
    ports:
      - "127.0.0.1:45303:45303"
```

`BOAT_CONTROL_PORT` sets the server port inside the container. The port mapping
is `host-address:host-port:container-port`; keep its last number equal to
`BOAT_CONTROL_PORT`. To change only the Windows host port to 8080, use
`127.0.0.1:8080:45303`. The health check follows the container environment.
After editing Compose, apply the change:

```powershell
docker compose up -d
```

Build only, without starting the application:

```powershell
docker compose build
# Or build the same image directly:
docker build -t boat-control:local .
```

The first build needs internet access for base images and dependencies. The image
contains the built UI and backend; it does not contain local uploads or databases.
The service runs as a non-root user with Gunicorn. Compose publishes it only on
the Windows computer's localhost interface, matching the application's local-first use.

## Persistent state

Compose creates named volumes for `/app/data` (databases, uploads, results, and
application settings) and `/app/config` (editable rule/filter configurations).
The initial configuration is copied from the image on first use. Later image
rebuilds preserve the volume contents, including settings edited through the UI.
Database migrations and rule catalog synchronization run on each startup.
Existing host `data/` contents are not imported automatically.

Settings paths refer to the Linux container. Use `data/results` and
`data/exception_tracking.db`, for example, rather than Windows drive paths.
Source files can be uploaded through the browser.

Stop the application while keeping its data:

```powershell
docker compose down
```

`docker compose down --volumes` deletes its persistent data and configurations.

## Transfer the built image

```powershell
docker save -o boat-control.tar boat-control:local
```

Copy the archive and `docker-compose.yml` to a computer with Docker using the
same CPU architecture, then run:

```powershell
docker load -i boat-control.tar
docker compose up -d --no-build
```

Named volumes are separate from the image and are not included in `docker save`.
