# Server

Server is available to administrators. It shows the machine this Sharry process is running on, so you can see whether memory, disk, or the installed runtime need attention while the app is in use.

Refresh reads the numbers again. They are a snapshot of the host at that moment, not a history.

## Memory

Total, used, and available RAM are the host figures. On Linux, available memory includes cache that the system can reclaim. This process is the memory the Sharry Node process itself is using.

## Storage

Used and available storage are the disk that contains the application directory. Database size is the PostgreSQL database Sharry is connected to. It grows with links, clicks, and saved settings, and it is already included in the disk figures.

## Runtime

The operating system, platform, architecture, and hostname identify the host. Package is the installed Sharry version. Node and PostgreSQL are the versions this process is using. CPU shows the core count and the 1, 5, and 15 minute load averages. Uptime is how long the operating system and this process have been running.
