import os
import glob
import subprocess

jobs_dir = "jobs"
job_dirs = sorted(glob.glob(f"{jobs_dir}/*"), key=os.path.getmtime, reverse=True)
for d in job_dirs:
    result_path = os.path.join(d, "result.mp4")
    if os.path.exists(result_path):
        print(f"Found latest result: {result_path}")
        size = os.path.getsize(result_path)
        print(f"Size: {size} bytes")
        
        # Probe video
        cmd = ["ffprobe", "-v", "error", "-show_entries", "stream=codec_name,width,height,duration", "-of", "default=noprint_wrappers=1", result_path]
        try:
            out = subprocess.check_output(cmd, text=True)
            print(out)
        except Exception as e:
            print(f"Error probing: {e}")
        break
else:
    print("No result.mp4 found.")
