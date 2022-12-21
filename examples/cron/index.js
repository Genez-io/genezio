export class CronExample {
    /**
     * Method called every minute by the genez.io infrastructure once the class is deployed.
     * 
     * To change the frequency with which the request is made, change the cronString in genezio.yaml configuration file.
     */
    sayHiEveryMinute() {
        console.log("Hi!")
    }
}
