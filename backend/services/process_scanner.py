import psutil
import random

def get_process_icon(process_name):
    # Mock icon logic mapping based on name
    name_lower = process_name.lower()
    if 'chrome' in name_lower: return 'Globe'
    if 'code' in name_lower or 'idea' in name_lower: return 'Code'
    if 'node' in name_lower or 'python' in name_lower or 'java' in name_lower: return 'Terminal'
    if 'sql' in name_lower: return 'Database'
    return 'Cpu'

def get_running_processes():
    processes = []
    # Iterate over all running processes
    for proc in psutil.process_iter(['pid', 'name', 'cpu_percent']):
        try:
            # Get process details as a named tuple
            info = proc.info
            
            # Filter out system processes or noise if needed
            if not info['name'] or info['pid'] == 0:
                continue

            # Creating a consistent shape with the frontend WinProcess model
            processes.append({
                "pid": info['pid'],
                "name": info['name'],
                "title": info['name'], # psutil name is usually the binary name
                "cpu": f"{info['cpu_percent'] or 0:.1f}%",
                "icon": get_process_icon(info['name'])
            })
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            pass
            
    # Sort by name for easier searching
    processes.sort(key=lambda x: x['name'].lower())
    return processes # Return all processes
