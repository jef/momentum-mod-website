import { Component, Input, OnInit } from '@angular/core';
import { NotificationsService } from '../../services/notifications.service';
import { Notification } from '@momentum/constants';
import { TimeAgoPipe } from '../../../../../../libs/frontend/pipes/src/lib/time-ago.pipe';
import { NbIconIconDirective } from '../../../../../../libs/frontend/directives/src/lib/icons/nb-icon-icon.directive';
import { ActivityContentComponent } from '../activity/activity-content/activity-content.component';
import { NgIf, NgFor, NgClass } from '@angular/common';
import { NbListModule, NbButtonModule, NbIconModule } from '@nebular/theme';

@Component({
  selector: 'mom-notifications',
  templateUrl: './notification.component.html',
  styleUrls: ['./notification.component.scss'],
  standalone: true,
  imports: [
    NbListModule,
    NgIf,
    NgFor,
    NgClass,
    ActivityContentComponent,
    NbButtonModule,
    NbIconModule,
    NbIconIconDirective,
    TimeAgoPipe
  ]
})
export class NotificationComponent implements OnInit {
  @Input() notifications: Notification[];

  constructor(private notificationService: NotificationsService) {}

  // This gets called every time the bell is clicked (to view notifications)
  ngOnInit() {
    this.notifications.sort((a: Notification, b: Notification) => {
      if (!a.read) {
        return !b.read ? 0 : -1;
      } else if (!b.read) {
        return 1;
      } else {
        return (
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      }
    });
  }

  readNotif(notif: Notification) {
    if (!notif.read) {
      notif.read = true;
      this.notificationService.markNotificationAsRead(notif);
    }
  }
  onClickNotif(notif: Notification) {
    this.readNotif(notif);
  }
  onHoverNotif(notif: Notification) {
    this.readNotif(notif);
  }

  removeNotif(notification: Notification) {
    this.notifications.splice(
      this.notifications.findIndex((notif) => notif.id === notification.id),
      1
    );
    this.notificationService.dismissNotification(notification);
  }
}
