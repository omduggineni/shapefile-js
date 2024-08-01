import server from './server.js'
export async function mochaGlobalSetup() {
    return new Promise((yes, no) => {
        this.server = server.listen(3000, (err) => {
            if (err) {
                return no(err);
            }
            yes()
        });
    });
}
export async function mochaGlobalTeardown() {
    return new Promise((yes, no) => {
        this.server.close((err) => {
            if (err) {
                return no(err);
            }
            yes();
        });
    });
};