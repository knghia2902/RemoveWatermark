import os
import glob
import subprocess

for p in glob.glob("web_jobs/*/result.mp4"):
    print(f"Fixing {p}...")
    tmp = p + ".tmp.mp4"
    subprocess.run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", p, "-c:v", "libx264", "-g", "15", "-preset", "ultrafast", "-c:a", "copy", "-movflags", "+faststart", tmp])
    os.replace(tmp, p)
    print("Done.")
print("All history fixed!")
