import urllib.request
try:
    req = urllib.request.Request("http://127.0.0.1:8765/api/work/5ce786a39f4a4a22bf5b8d3bceeead6d/result.mp4")
    req.add_header("Range", "bytes=1000-2000")
    with urllib.request.urlopen(req) as response:
        print("Status Code:", response.status)
        print("Headers:", response.headers)
        data = response.read()
        print("Length:", len(data))
except Exception as e:
    print("Error:", e)
