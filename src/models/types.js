export const PacketType = {
    CLIENT: 'client',
    SERVER: 'server',
    DB: 'db'
};

export class WinProcess {
    constructor(pid, name, title, cpu, icon) {
        this.pid = pid;
        this.name = name;
        this.title = title;
        this.cpu = cpu;
        this.icon = icon;
    }
}
