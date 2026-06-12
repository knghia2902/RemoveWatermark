import os
import glob
import subprocess

for p in glob.glob("web_jobs/*/result.mp4"):
    # Check if it only has 1 keyframe
    out = subprocess.check_output(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'frame=key_frame', '-of', 'csv=p=0', p]).decode('utf-8')
    keyframes = sum(1 for line in out.splitlines() if line.startswith('1'))
    
    if keyframes < 5:
        print(f"Fixing {p} (has {keyframes} keyframes)...")
        tmp = p + ".tmp.mp4"
        subprocess.run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", p, "-c:v", "libx264", "-g", "15", "-preset", "ultrafast", "-c:a", "copy", "-movflags", "+faststart", tmp])
        os.replace(tmp, p)
        print("Done.")
print("All history fixed!")
