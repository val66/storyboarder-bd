# Missing resources

*[Version française](../fr/missing-resources.md)*

Task #443. What the application does when an opened Project uses 3D models or panel images it
cannot find, and how to see it without breaking a real Project.

## Why it happens

Models and images are not stored next to the Project file, but in the `Modeles` and `Images`
folders of the **Projects folder** set in Settings. That folder differs from one launch to another:

- with `npm start`, it is `Projets` at the root of the repository;
- once installed, it is `Documents\Storyboarder BD\Projets` (#447), and the installed version has its own
  settings.

A Project opened "from the other side" therefore showed up riddled with "Image not found" and
placeholder boxes, with no explanation. Noticed on the first installation.

## What the application does

After a Project is opened (at startup, or through "Open"), and **after** renamed models are
repointed, `src/missing-resources.js` compares what the Project uses (every Page of every Volume,
and the Scenes) to the **listings** of both folders. The caches are not consulted: a file that is
present but unreadable is not a folder problem, and the preloading cascade has not finished when the
question is asked.

If something is missing, the "Missing resources" dialog says:

- how many models and images are missing, and that nothing is removed from the Project;
- where the application looked, full paths;
- which files, eight per category, then "and N more";
- how to fix it: choose the right folder in Settings (a button opens it), or copy the files;
- a hint when the Project is saved somewhere other than the Projects folder: that folder is
  probably the right one.

Changing the folder ("Choose..." or "Default folder") forgets the files marked as missing, restarts
preloading and runs the check again: the files come back without restarting, and the dialog updates
or disappears.

## Seeing the dialog without breaking a Project

In development only, the `STORYBOARD_SIMULER_RESSOURCES` variable opens the dialog at startup with
fake data: three models and eleven images missing (to see the truncated list) and a Project saved
elsewhere (to see the hint). The search paths are the real ones.

```
[Console]::OutputEncoding=[Text.Encoding]::UTF8; cd C:\WebProjects\Storyboarder; $env:STORYBOARD_SIMULER_RESSOURCES='1'; npm start
```

⚠️ As with updates ([updates.md](updates.md)), the variable stays set in that terminal. A yellow
banner says so. To go back to normal, close the terminal, or:

```
[Console]::OutputEncoding=[Text.Encoding]::UTF8; Remove-Item Env:STORYBOARD_SIMULER_RESSOURCES; cd C:\WebProjects\Storyboarder; npm start
```

Without the simulation, you can also set an empty Projects folder in Settings and reopen the
Project, then come back with "Default folder".
